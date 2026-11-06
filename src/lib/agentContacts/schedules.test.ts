import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pythonTimestamp, type Database, type Query } from "@/lib/career/matching/internalScoring/database";
import type { AgentContactSource } from "./contracts";
import { assertAgentContactSource } from "./store";
import { CompanyScheduleInputError, enqueueDueCompanyAgentSchedules, manageCompanySchedule } from "./schedules";

// Harper's own schedules: a run woken by a schedule cannot bring runs forward
// or outlive the schedule that woke it, and a one-off frees its slot once its
// run has ended. Only the objects these paths read are created here.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text,
    is_reviewing boolean);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace,
    source_type text, status text, is_expired boolean, expires_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, team_id uuid);
  create table company_user_workspace(id uuid primary key, company_workspace_id uuid, company_user_id uuid,
    authority text, access_scope text, team_id uuid);
  create table company_workspace_team_members(membership_id uuid, team_id uuid);
  create table company_conversations(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, metadata jsonb, unique(company_workspace_id, role_id));
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid,
    conversation_id uuid, role_id uuid, company_user_id uuid, role text, content text, message_type text, status text,
    metadata jsonb);
  create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    conversation_id uuid, role_id uuid, actor_user_id uuid, anchor_message_id bigint, action_name text,
    action_context jsonb not null default '{}', idempotency_key text unique, status text not null default 'queued',
    queue_dispatch_status text, locked_by text, created_at timestamptz not null default now());
  create table company_decision_events(id bigint generated always as identity primary key, company_workspace_id uuid,
    role_id uuid, subject_kind text, subject_id uuid, action text, detail jsonb, channel text, actor_user_id uuid,
    idempotency_key text, unique(role_id, idempotency_key));
  create table company_agent_schedules(id uuid primary key default gen_random_uuid(), company_workspace_id uuid not null,
    role_id uuid not null, title text not null, instruction text not null, target_refs jsonb not null default '{}',
    timezone text not null default 'Asia/Seoul', next_run_at timestamptz, recurrence text, interval_days numeric,
    status text not null default 'active', revision bigint not null default 1, directive_revision bigint not null default 1,
    source jsonb not null default '{}', operation_key text not null, last_job_id uuid,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const member = "10000000-0000-4000-8000-000000000003";
const membership = "10000000-0000-4000-8000-000000000004";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const at = (fromNow: number) => new Date(Date.now() + fromNow).toISOString();
const time = (value: unknown) => new Date(String(value)).getTime();
const title = "Check again";
const instruction = "Look at the search result";
const refused = (error: unknown) => error instanceof CompanyScheduleInputError && /23 hours/.test(error.message);

async function fixture(t: TestContext) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec("SET TIME ZONE 'UTC'");
  await pg.exec(SETUP);
  const migration = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
  await pg.exec(await migration("20261105210000_company_agent_schedule_tiers.sql"));
  const introductions = await migration("20261103125705_internal_role_agent_introductions.sql");
  await pg.exec(introductions.slice(introductions.indexOf("create function public.enqueue_agent_company_event_v1"),
    introductions.indexOf("revoke all on function public.enqueue_agent_company_event_v1")));
  await pg.exec(`insert into company_workspace values ('${workspace}', 'Company', null, false);
    insert into company_roles values ('${role}', '${workspace}', 'internal', 'active', false, null);
    insert into company_internal_roles values ('${role}', null);
    insert into company_user_workspace values ('${membership}', '${workspace}', '${member}', 'owner', 'organization', null);`);
  // The server adapter's value types: timestamps as strings, numbers as numbers.
  const adapter = (connection: any): Query => async (sql, params = []) =>
    (await connection.query(sql, params, { parsers: { 1184: pythonTimestamp, 1700: Number, 20: Number } })).rows;
  const db: Database = { query: adapter(pg), transaction: (work) => pg.transaction((tx) => work(adapter(tx))) };

  let seed = 0;
  const schedule = async (fields: Record<string, unknown>) => {
    const row: Record<string, unknown> = {
      company_workspace_id: workspace, role_id: role, title, instruction, timezone: "UTC", created_by: "user",
      effect_tier: 0, operation_key: `seed-${seed++}`, ...fields,
    };
    const columns = Object.keys(row);
    const [saved] = await db.query(
      `insert into company_agent_schedules(${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
      columns.map((column) => row[column]));
    return saved;
  };
  const read = async (id: string) => (await db.query("select * from company_agent_schedules where id = $1", [id]))[0];
  const created = async (key: string) =>
    (await db.query("select * from company_agent_schedules where operation_key = $1", [key]))[0];
  /** A running job; an agent_schedule_due job for the given schedule. */
  const wake = async (woken: Record<string, any> | null, action = "agent_schedule_due") => {
    const context = woken ? { scheduleId: woken.id, scheduleRevision: woken.directive_revision } : {};
    const [job] = await db.query(
      `insert into company_agent_web_action_jobs(company_workspace_id, role_id, action_name, action_context, status, locked_by)
      values ($1, $2, $3, $4, 'processing', 'lease') returning id`,
      [workspace, role, action, JSON.stringify(context)]);
    return { kind: "company_event", workspaceId: workspace, roleId: role, jobId: job.id, leaseOwner: "lease" } as const;
  };
  const manage = (source: Exclude<AgentContactSource, { kind: "career" }>, input: Record<string, unknown>, key = "change") =>
    manageCompanySchedule(source, { roleId: role, ...input }, key, db);
  return { db, schedule, read, created, wake, manage };
}

test("a run woken by a schedule cannot bring runs forward", async (t) => {
  const { schedule, read, created, wake, manage } = await fixture(t);
  const own = await schedule({ recurrence: "0 9 * * *", next_run_at: at(DAY) });
  const other = await schedule({ next_run_at: at(2 * HOUR) });
  const run = await wake(own);

  // Pulling its own next run, another schedule's, or adding a run soon: refused.
  await assert.rejects(manage(run, { action: "update", scheduleId: own.id, expectedRevision: own.revision,
    nextRunAt: at(10 * MINUTE) }), refused);
  await assert.rejects(manage(run, { action: "update", scheduleId: other.id, expectedRevision: other.revision,
    nextRunAt: at(10 * MINUTE) }), refused);
  await assert.rejects(manage(run, { action: "create", title, instruction, nextRunAt: at(10 * MINUTE) }, "soon"), refused);
  const soon = new Date(Date.now() + HOUR);
  await assert.rejects(manage(run, { action: "create", title, instruction, timezone: "UTC",
    recurrence: `${soon.getUTCMinutes()} ${soon.getUTCHours()} * * *` }, "daily-soon"), refused);
  assert.equal((await read(own.id)).revision, own.revision);
  assert.equal((await read(other.id)).revision, other.revision);
  assert.equal(await created("soon"), undefined);

  // Changing only the text (also echoing the current time), postponing, pausing
  // and cancelling: allowed.
  await manage(run, { action: "update", scheduleId: other.id, expectedRevision: other.revision,
    instruction: "Look at the new result", nextRunAt: other.next_run_at });
  let current = await read(other.id);
  assert.equal(current.instruction, "Look at the new result");
  assert.equal(time(current.next_run_at), time(other.next_run_at));
  await manage(run, { action: "update", scheduleId: other.id, expectedRevision: current.revision, nextRunAt: at(2 * DAY) });
  current = await read(other.id);
  await manage(run, { action: "pause", scheduleId: other.id, expectedRevision: current.revision });
  current = await read(other.id);
  assert.equal(current.status, "paused");
  await manage(run, { action: "cancel", scheduleId: other.id, expectedRevision: current.revision });
  assert.equal((await read(other.id)).status, "cancelled");
  await manage(run, { action: "update", scheduleId: own.id, expectedRevision: own.revision, nextRunAt: at(2 * DAY) });
  assert.ok(time((await read(own.id)).next_run_at) > Date.now() + DAY);

  // A run 23 hours or more after this run started: allowed.
  await manage(run, { action: "create", title, instruction, nextRunAt: at(DAY) }, "tomorrow");
  assert.equal((await created("tomorrow")).status, "active");
});

test("the 23-hour refusal names the earliest allowed time in the schedule's timezone", async (t) => {
  const { db, schedule, wake, manage } = await fixture(t);
  const own = await schedule({ recurrence: "0 9 * * *", next_run_at: at(DAY) });
  const run = await wake(own);
  const [job] = await db.query("select created_at from company_agent_web_action_jobs where id = $1", [run.jobId]);
  const earliest = new Date(Math.ceil((time(job.created_at) + 23 * HOUR) / MINUTE) * MINUTE);
  const local = (timezone: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(earliest);
    const part = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")} ${timezone}`;
  };
  const names = (timezone: string) => (error: unknown) =>
    refused(error) && (error as Error).message.includes(local(timezone)) && (error as Error).message.includes(earliest.toISOString());

  // A new schedule: the timezone it asks for.
  for (const timezone of ["America/New_York", "Asia/Seoul"])
    await assert.rejects(manage(run, { action: "create", title, instruction, timezone, nextRunAt: at(HOUR) }, `soon-${timezone}`),
      names(timezone));
  // An existing schedule: its own timezone.
  const tokyo = await schedule({ timezone: "Asia/Tokyo", next_run_at: at(2 * DAY) });
  await assert.rejects(manage(run, { action: "update", scheduleId: tokyo.id, expectedRevision: tokyo.revision,
    nextRunAt: at(HOUR) }), names("Asia/Tokyo"));
});

test("runs woken by a person or an event may schedule soon", async (t) => {
  const { db, created, wake, manage } = await fixture(t);
  const [message] = await db.query(
    `insert into company_messages(company_workspace_id, role_id, company_user_id, role, message_type)
    values ($1, $2, $3, 'user', 'chat') returning id`, [workspace, role, member]);
  const person = { kind: "company", workspaceId: workspace, userId: member, messageId: message.id } as const;
  await manage(person, { action: "create", title, instruction, nextRunAt: at(10 * MINUTE) }, "person");
  await manage(await wake(null, "agent_contact_received"),
    { action: "create", title, instruction, nextRunAt: at(10 * MINUTE) }, "event");
  assert.equal((await created("person")).created_by, "user");
  assert.equal((await created("event")).created_by, "agent");
});

test("a schedule made by a schedule run ends no later than the one that woke it", async (t) => {
  const { db, schedule, read, created, wake, manage } = await fixture(t);
  const waking = await schedule({ recurrence: "0 9 * * *", next_run_at: at(DAY), expires_at: at(5 * DAY) });
  const run = await wake(waking);
  const make = async (key: string, expiresAt?: string) => {
    await manage(run, { action: "create", title, instruction, nextRunAt: at(2 * DAY), ...(expiresAt ? { expiresAt } : {}) }, key);
    return time((await created(key)).expires_at);
  };
  assert.equal(await make("default"), time(waking.expires_at));
  assert.equal(await make("longer", at(20 * DAY)), time(waking.expires_at));
  const shorter = at(3 * DAY);
  assert.equal(await make("shorter", shorter), time(shorter));

  // The handoff example: A ends 12/1, and its run on 11/28 makes B for 12/5. B
  // ends 12/1 as well, so it never runs and never makes a C.
  await manage(run, { action: "create", title, instruction, nextRunAt: at(7 * DAY) }, "after-end");
  const b = await created("after-end");
  assert.equal(time(b.expires_at), time(waking.expires_at));
  assert.ok(time(b.next_run_at) > time(b.expires_at));
  // Time passes beyond both ends and B's run time: B is closed, not run.
  await db.query("update company_agent_schedules set expires_at = $2, next_run_at = $3 where id = $1",
    [b.id, at(-4 * DAY), at(-MINUTE)]);
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 0);
  assert.equal((await read(b.id)).status, "expired");
  const [jobs] = await db.query(
    "select count(*)::int as n from company_agent_web_action_jobs where action_context->>'scheduleId' = $1", [b.id]);
  assert.equal(jobs.n, 0);

  // A person's request keeps the usual 30 days.
  const [message] = await db.query(
    `insert into company_messages(company_workspace_id, role_id, company_user_id, role, message_type)
    values ($1, $2, $3, 'user', 'chat') returning id`, [workspace, role, member]);
  await manage({ kind: "company", workspaceId: workspace, userId: member, messageId: message.id },
    { action: "create", title, instruction, nextRunAt: at(2 * DAY) }, "person");
  assert.ok(time((await created("person")).expires_at) > Date.now() + 29 * DAY);
});

test("a one-off schedule stays active while its run goes on and frees its slot after", async (t) => {
  const { db, schedule, read } = await fixture(t);
  const once = await schedule({ next_run_at: at(-MINUTE) });
  const daily = await schedule({ recurrence: "0 9 * * *", next_run_at: at(-MINUTE) });
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 2);
  const queued = await read(once.id);
  assert.equal(queued.status, "active");
  assert.equal(queued.next_run_at, null);
  assert.ok(queued.last_job_id);

  // Queued, then running: the schedule stays active and the run passes its own check.
  await enqueueDueCompanyAgentSchedules(db);
  assert.equal((await read(once.id)).status, "active");
  await db.query("update company_agent_web_action_jobs set status = 'processing', locked_by = 'lease' where id = $1",
    [queued.last_job_id]);
  await enqueueDueCompanyAgentSchedules(db);
  assert.equal((await read(once.id)).status, "active");
  await assertAgentContactSource(db.query,
    { kind: "company_event", workspaceId: workspace, roleId: role, jobId: queued.last_job_id, leaseOwner: "lease" }, role);

  // Once its job has ended the one-off is closed; a recurring schedule stays.
  await db.query("update company_agent_web_action_jobs set status = 'completed_silent' where id = $1", [queued.last_job_id]);
  await enqueueDueCompanyAgentSchedules(db);
  const closed = await read(once.id);
  assert.equal(closed.status, "expired");
  assert.equal(closed.revision, queued.revision + 1);
  assert.equal((await read(daily.id)).status, "active");
});

test("a schedule at its run count stays active until its last run ends", async (t) => {
  const { db, schedule, read } = await fixture(t);
  const limited = await schedule({ recurrence: "0 9 * * *", next_run_at: at(-MINUTE), max_runs: 1 });
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 1);
  const queued = await read(limited.id);
  assert.equal(queued.run_count, 1);

  // Queued, then running, even when its next time has come: no extra run, the
  // schedule stays active and the run passes its own check.
  await db.query("update company_agent_schedules set next_run_at = $2 where id = $1", [limited.id, at(-MINUTE)]);
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 0);
  assert.equal((await read(limited.id)).status, "active");
  await db.query("update company_agent_web_action_jobs set status = 'processing', locked_by = 'lease' where id = $1",
    [queued.last_job_id]);
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 0);
  assert.equal((await read(limited.id)).status, "active");
  await assertAgentContactSource(db.query,
    { kind: "company_event", workspaceId: workspace, roleId: role, jobId: queued.last_job_id, leaseOwner: "lease" }, role);

  // Once that run has ended the schedule is closed instead of running again.
  await db.query("update company_agent_web_action_jobs set status = 'completed_message' where id = $1", [queued.last_job_id]);
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 0);
  const closed = await read(limited.id);
  assert.equal(closed.status, "expired");
  assert.equal(closed.run_count, 1);
});
