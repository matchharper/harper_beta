import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pythonTimestamp, type Database, type Query } from "@/lib/career/matching/internalScoring/database";
import { enqueueDueCompanyAgentSchedules } from "@/lib/agentContacts/schedules";
import { assertAgentContactSource, AgentContactSupersededError } from "@/lib/agentContacts/store";
import { cancelHarperScheduleFromTodo } from "./harperSchedules.server";
import { OrgHttpError } from "./httpError";

// Cancelling Harper's scheduled work from the To-do. The scheduler raises a
// schedule's revision every time it starts a run, so the revision the To-do
// showed is often old; the cancel still applies and is still the member's decision.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text,
    is_reviewing boolean);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace,
    source_type text, status text, is_expired boolean, expires_at timestamptz);
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

const workspace = "30000000-0000-4000-8000-000000000001";
const role = "30000000-0000-4000-8000-000000000002";
const otherRole = "30000000-0000-4000-8000-000000000003";
const member = "30000000-0000-4000-8000-000000000004";
const at = (fromNow: number) => new Date(Date.now() + fromNow).toISOString();

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
    insert into company_roles values ('${role}', '${workspace}', 'internal', 'active', false, null),
      ('${otherRole}', '${workspace}', 'internal', 'active', false, null);`);
  const adapter = (connection: any): Query => async (sql, params = []) =>
    (await connection.query(sql, params, { parsers: { 1184: pythonTimestamp, 1700: Number, 20: Number } })).rows;
  const db: Database = { query: adapter(pg), transaction: (work) => pg.transaction((tx) => work(adapter(tx))) };
  let seed = 0;
  const schedule = async (fields: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      company_workspace_id: workspace, role_id: role, title: "Check again", instruction: "Look at the result",
      timezone: "UTC", created_by: "agent", effect_tier: 0, operation_key: `seed-${seed++}`, next_run_at: at(86_400_000), ...fields,
    };
    const columns = Object.keys(row);
    const [saved] = await db.query(
      `insert into company_agent_schedules(${columns.join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
      columns.map((column) => row[column]));
    return saved;
  };
  const read = async (id: string) => (await db.query("select * from company_agent_schedules where id = $1", [id]))[0];
  const cancel = (row: Record<string, any>, roleId = role) =>
    cancelHarperScheduleFromTodo(
      { user: { id: member }, workspaceId: workspace, roleId, scheduleId: row.id, expectedRevision: Number(row.revision) },
      db
    );
  return { db, schedule, read, cancel };
}

test("a To-do cancel works after the scheduler ran and is recorded as the member's decision", async (t) => {
  const { db, schedule, read, cancel } = await fixture(t);
  const shown = await schedule({ recurrence: "0 9 * * *", next_run_at: at(-60_000) });
  assert.equal(await enqueueDueCompanyAgentSchedules(db), 1);
  const queued = await read(shown.id);
  assert.ok(Number(queued.revision) > Number(shown.revision));
  await db.query("update company_agent_web_action_jobs set status = 'processing', locked_by = 'lease' where id = $1",
    [queued.last_job_id]);

  // The To-do still holds the revision from before the scheduler ran.
  assert.deepEqual(await cancel(shown), { ok: true });
  const cancelled = await read(shown.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.next_run_at, null);
  assert.deepEqual(cancelled.source, { kind: "company", workspaceId: workspace, userId: member, channel: "todo" });
  const decisions = await db.query("select * from company_decision_events where subject_id = $1", [shown.id]);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].action, "cancel");
  assert.equal(decisions[0].channel, "todo");
  assert.equal(decisions[0].actor_user_id, member);

  // The run the scheduler already started sees the change and stops.
  await assert.rejects(
    assertAgentContactSource(db.query,
      { kind: "company_event", workspaceId: workspace, roleId: role, jobId: queued.last_job_id, leaseOwner: "lease" }, role),
    (error) => error instanceof AgentContactSupersededError
  );
});

test("a cancel says when the schedule already ended, and touches nothing else", async (t) => {
  const { db, schedule, read, cancel } = await fixture(t);
  const paused = await schedule({ status: "paused" });
  assert.deepEqual(await cancel(paused), { ok: true });
  assert.equal((await read(paused.id)).status, "cancelled");

  const refused = (status: number, message: string) => (error: unknown) =>
    error instanceof OrgHttpError && error.status === status && error.message === message;
  await assert.rejects(cancel(await read(paused.id)), refused(409, "이미 취소된 예약이에요."));
  const expired = await schedule({ status: "expired", next_run_at: null });
  await assert.rejects(cancel(expired), refused(409, "이미 끝난 예약이에요."));
  // Another Role's schedule or an introduction's follow-up: not found here, unchanged.
  const active = await schedule();
  await assert.rejects(cancel(active, otherRole), refused(404, "예약을 찾지 못했어요."));
  const introduction = await schedule({ created_by: null, target_refs: JSON.stringify({ introductionRootId: member }) });
  await assert.rejects(cancel(introduction), refused(404, "예약을 찾지 못했어요."));
  assert.equal((await read(active.id)).status, "active");
  assert.equal((await read(introduction.id)).status, "active");
  const decisions = await db.query("select subject_id from company_decision_events");
  assert.deepEqual(decisions.map((row) => row.subject_id), [paused.id]);
});
