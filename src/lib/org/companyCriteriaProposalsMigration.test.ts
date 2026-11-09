import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Pass reasons sharpen the criteria (S2 G): the cursor, when a Role is due,
// and suggestions in the To-do. Only the objects the migrations read are
// created. company_agent_update_proposals exists only in the live database;
// it is created here as designed (docs/company-side-llm-context-memory-tools-
// plan-ko.md 13.4) plus the message_* columns of the generated types.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    status text default 'active', priority int, is_expired boolean default false, updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text,
    criteria jsonb default '[]', team_id uuid, memory text, is_company_first_search boolean, updated_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, company_appeal text, revision int not null default 0);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create table company_conversations(id uuid primary key, company_workspace_id uuid, role_id uuid);
  create table company_messages(id bigint generated always as identity primary key, company_user_id uuid,
    company_workspace_id uuid, content text, conversation_id uuid, created_at timestamptz, mentions jsonb,
    message_type text, metadata jsonb, model text, role text, role_id uuid, status text, thinking_logs jsonb);
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    content text, deleted_at timestamptz);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(coalesce((select i.memory from company_internal_roles i where i.role_id = p_role), '')) $$;
  create table company_agent_update_proposals (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references company_workspace(company_workspace_id) on delete cascade,
    scope_key text not null,
    status text not null default 'draft'
      check (status in ('draft', 'pending', 'applied', 'rejected', 'superseded', 'expired', 'stale')),
    source text not null check (source in ('slack', 'chat')),
    slack_thread_id uuid,
    summary text not null check (char_length(summary) between 1 and 160),
    preview text check (preview is null or char_length(preview) <= 3000),
    presentation_text text check (presentation_text is null or char_length(presentation_text) between 1 and 6000),
    payload jsonb,
    created_by_user_message_id bigint,
    presented_message_id bigint,
    message_type text not null,
    message_metadata jsonb not null default '{}',
    message_model text,
    message_thinking_logs jsonb not null default '[]',
    expires_at timestamptz not null,
    applied_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    constraint company_agent_update_proposals_pending_payload
      check (status not in ('draft', 'pending') or payload is not null),
    constraint company_agent_update_proposals_presentation
      check (status not in ('draft', 'pending') or (preview is not null and presentation_text is not null)),
    constraint company_agent_update_proposals_delivery
      check (status <> 'pending' or presented_message_id is not null),
    constraint company_agent_update_proposals_draft_source
      check (status <> 'draft' or (source = 'slack' and presented_message_id is null)),
    constraint company_agent_update_proposals_slack_scope
      check ((source = 'slack') = (slack_thread_id is not null)),
    constraint company_agent_update_proposals_applied_at
      check ((status = 'applied') = (applied_at is not null))
  );
  create unique index company_agent_update_proposals_one_pending
    on company_agent_update_proposals(workspace_id, scope_key) where status = 'pending';
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002"; // active, has a conversation
const ended = "10000000-0000-4000-8000-000000000003";
const lonely = "10000000-0000-4000-8000-000000000004"; // no conversation
const quiet = "10000000-0000-4000-8000-000000000005"; // active, few decisions
const kim = "20000000-0000-4000-8000-000000000001";
const lee = "20000000-0000-4000-8000-000000000002";
const talent = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const conversationOf = (roleId: string) => `4${roleId.slice(1)}`;

const BEFORE = [
  "20260922082129_company_agent_web_action_turns.sql",
  "20261105020000_company_decision_events.sql",
  "20261105080000_company_role_brief_revisions.sql",
  "20261105090100_company_role_setting_revisions.sql",
];
const MIGRATION = "20261107021000_company_criteria_proposals.sql";
const sql = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function setup(beforeMigration?: (db: PGlite) => Promise<void>) {
  const db = new PGlite();
  await db.exec(SETUP);
  await db.exec(`
    insert into company_workspace values ('${workspace}', 'Company');
    insert into company_roles(role_id, company_workspace_id, name, source_type, status) values
      ('${role}', '${workspace}', 'Engineer', 'internal', 'active'),
      ('${ended}', '${workspace}', 'Old', 'internal', 'ended'),
      ('${lonely}', '${workspace}', 'Lonely', 'internal', 'active'),
      ('${quiet}', '${workspace}', 'Quiet', 'internal', 'paused');
    insert into company_internal_roles(role_id, request, criteria) values
      ('${role}', 'brief', '[{"id":"c-go","name":"Go","criteria":"Ships Go"}]'),
      ('${ended}', 'brief', '[]'), ('${lonely}', 'brief', '[]'), ('${quiet}', 'brief', '[]');
    insert into company_conversations values
      ('${conversationOf(role)}', '${workspace}', '${role}'),
      ('${conversationOf(ended)}', '${workspace}', '${ended}'),
      ('${conversationOf(quiet)}', '${workspace}', '${quiet}');
  `);
  for (const name of BEFORE) await db.exec(await sql(name));
  await beforeMigration?.(db);
  await db.exec(await sql(MIGRATION));
  return db;
}

let serial = 0;
async function decide(db: PGlite, args: {
  roleId?: string; action: string; detail?: object; tags?: string[]; reason?: string | null; actor?: string;
  subject?: string; createdAt?: string;
}) {
  serial += 1;
  const { rows } = await db.query<any>(
    `select record_company_decision_v1($1, $2, 'member_candidate', $3, $4, 'web', $5, $6, null, $7, $8, $9::jsonb) id`,
    [workspace, args.roleId ?? role, args.subject ?? talent(serial), args.action, args.actor ?? kim, `key:${serial}`,
      args.reason ?? null, args.tags ?? [], JSON.stringify(args.detail ?? {})]);
  if (args.createdAt) await db.query("update company_decision_events set created_at = $2 where id = $1", [rows[0].id, args.createdAt]);
  return Number(rows[0].id);
}
const cursor = async (db: PGlite, roleId = role) => (await db.query<any>(
  "select last_consumed_decision_id c from company_internal_roles where role_id = $1", [roleId])).rows[0].c;
const due = async (db: PGlite) => (await db.query<any>(
  "select enqueue_due_company_decision_consolidations_v1(3, 7, 20) n")).rows[0].n;
const jobs = async (db: PGlite) => (await db.query<any>(
  `select role_id, actor_user_id, conversation_id, action_context, status, anchor_message_id
   from company_agent_web_action_jobs where action_name = 'consolidate_decisions' order by created_at`)).rows;

test("the cursor starts after earlier decisions, moves forward only and is not a Role setting", async () => {
  let earlier = 0;
  let versionsBefore = 0;
  const countVersions = async (db: PGlite) => Number((await db.query<any>(
    "select count(*) n from company_role_setting_revisions where role_id = $1", [role])).rows[0].n);
  const db = await setup(async (before) => {
    await decide(before, { action: "pass" });
    earlier = await decide(before, { action: "stop", detail: { stage: "process_stopped" } });
    versionsBefore = await countVersions(before);
  });
  try {
    const versions = () => countVersions(db);
    assert.equal(Number(await cursor(db)), earlier);
    assert.equal(await cursor(db, quiet), null);
    // Setting the cursor in the migration left the Role's setting versions as they were.
    assert.equal(await versions(), versionsBefore);
    const before = await versions();
    await db.query("select consume_company_decisions_v1($1, $2)", [role, earlier - 1]);
    assert.equal(Number(await cursor(db)), earlier);
    await db.query("select consume_company_decisions_v1($1, $2)", [role, earlier + 5]);
    assert.equal(Number(await cursor(db)), earlier + 5);
    // Moving the cursor is bookkeeping: no new Role setting version.
    assert.equal(await versions(), before);
    const snapshot = (await db.query<any>("select company_role_settings_snapshot_v1($1) s", [role])).rows[0].s;
    assert.equal("last_consumed_decision_id" in snapshot, false);
    // Earlier decisions are not new, so nothing is due right after the migration.
    assert.equal(await due(db), 0);
  } finally {
    await db.close();
  }
});

test("a Role is due after three new pass decisions or a week; one job at a time", async () => {
  const db = await setup();
  try {
    await decide(db, { action: "pass", tags: ["c-go"] });
    await decide(db, { action: "stop", detail: { stage: "process_stopped" }, reason: "다른 후보로" });
    // Decisions that are not passes do not count.
    await decide(db, { action: "stage_change", detail: { stage: "connected" } });
    await decide(db, { action: "save" });
    await decide(db, { action: "request_intro" });
    assert.equal(await due(db), 0);
    const newest = await decide(db, { action: "stage_change", detail: { stage: "archived" }, actor: lee });
    // Ended Roles and Roles without a conversation are not read.
    for (let i = 0; i < 3; i += 1) await decide(db, { roleId: ended, action: "pass" });
    for (let i = 0; i < 3; i += 1) await decide(db, { roleId: lonely, action: "pass" });
    assert.equal(await due(db), 1);
    const [job] = await jobs(db);
    assert.equal(job.role_id, role);
    assert.equal(job.actor_user_id, lee);
    assert.equal(job.conversation_id, conversationOf(role));
    assert.deepEqual(job.action_context, { roleId: role, throughDecisionId: newest });
    const anchor = (await db.query<any>("select message_type, role from company_messages where id = $1",
      [job.anchor_message_id])).rows[0];
    assert.deepEqual(anchor, { message_type: "web_action", role: "user" });
    // While it is queued, the Role is not queued again.
    await decide(db, { action: "pass" });
    assert.equal(await due(db), 0);
    // Once read, only newer decisions count again.
    await db.query("update company_agent_web_action_jobs set status = 'completed_silent'");
    await db.query("select consume_company_decisions_v1($1, $2)", [role, newest + 1]);
    assert.equal(await due(db), 0);
    // One unread pass a week old makes the Role due on its own.
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await decide(db, { roleId: quiet, action: "pass", createdAt: old });
    assert.equal(await due(db), 1);
    assert.equal((await jobs(db)).at(-1).role_id, quiet);
  } finally {
    await db.close();
  }
});

test("suggestions: one pending per Role, answered in the To-do as decisions, never suggested twice", async () => {
  const db = await setup();
  try {
    const payload = (key: string) => ({
      version: 1,
      change: { type: "criterion_level", criterionKey: "c-go", criterionName: "Go", from: "important", to: "required" },
      evidence: { count: 3, window: 4, decisionIds: [1, 2, 3] },
      locale: "ko",
      key,
    });
    const create = async (key: string, expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString()) =>
      (await db.query<any>(
        `select create_company_brief_proposal_v1($1, $2, 'criteria_refinement', $3, 1, $4, $5, $6::jsonb, $7) r`,
        [workspace, role, key, "'Go' 기준을 중요에서 필수로 올릴까요?", "Go: 중요 → 필수", JSON.stringify(payload(key)), expiresAt]
      )).rows[0].r;
    const resolve = async (id: string, actor: string | null, action: string, detail: object = {}, roleId = role) =>
      (await db.query<any>(`select resolve_company_brief_proposal_v1($1, $2, $3, $4, $5, $6::jsonb) r`,
        [id, workspace, roleId, actor, action, JSON.stringify(detail)])).rows[0].r;
    const proposal = async (id: string) => (await db.query<any>(
      `select status, kind, source, scope_key, content_key, base_brief_revision, presented_message_id, applied_at, payload
       from company_agent_update_proposals where id = $1`, [id])).rows[0];
    const decisions = async () => (await db.query<any>(
      `select subject_kind, subject_id, action, channel, actor_user_id, detail from company_decision_events
       where subject_kind = 'proposal' order by id`)).rows;
    const input = async () => (await db.query<any>("select company_decision_consolidation_input_v1($1) i", [role])).rows[0].i;

    const first = await create("criterion_level:c-go:important>required");
    assert.equal(first.status, "created");
    const row = await proposal(first.proposalId);
    assert.equal(row.status, "pending");
    assert.equal(row.kind, "criteria_refinement");
    assert.equal(row.source, "chat");
    assert.equal(row.scope_key, `brief:${role}`);
    assert.equal(row.base_brief_revision, 1);
    assert.equal(row.presented_message_id, null);
    assert.equal((await create("criterion_level:other:nice>important")).status, "pending_exists");

    // The reader: decisions newest first (whether a reason text exists, never the text), the pending suggestion.
    const tagged = await decide(db, { action: "pass", tags: ["c-go", "timing"], reason: "Go 경험이 얕음" });
    const plain = await decide(db, { action: "stop", detail: { stage: "process_stopped" } });
    let read = await input();
    assert.equal(read.open, true);
    assert.equal(read.briefRevision, 1);
    assert.deepEqual(read.decisions.map((d: any) => [d.id, d.reasonTags, d.hasReasonText]),
      [[plain, [], false], [tagged, ["c-go", "timing"], true]]);
    assert.equal(JSON.stringify(read).includes("Go 경험이 얕음"), false);
    assert.equal(read.pending.id, first.proposalId);
    assert.deepEqual(read.answeredKeys, []);

    // Accepting: claim, (the web saves the Brief), apply. Others wait meanwhile.
    const claimed = await resolve(first.proposalId, kim, "claim");
    assert.equal(claimed.status, "claimed");
    assert.equal(claimed.payload.change.criterionKey, "c-go");
    assert.equal("claim" in claimed.payload, false);
    assert.equal((await resolve(first.proposalId, lee, "reject")).status, "busy");
    assert.equal((await resolve(first.proposalId, lee, "apply")).status, "busy");
    assert.equal((await resolve(first.proposalId, null, "stale")).status, "busy");
    const applied = await resolve(first.proposalId, kim, "apply", { briefRevision: 2 });
    assert.equal(applied.status, "applied");
    const done = await proposal(first.proposalId);
    assert.equal(done.status, "applied");
    assert.ok(done.applied_at);
    assert.equal(done.payload, null);
    assert.equal((await resolve(first.proposalId, kim, "reject")).status, "applied");
    const [accepted] = await decisions();
    assert.equal(accepted.subject_id, first.proposalId);
    assert.equal(accepted.action, "accept");
    assert.equal(accepted.channel, "todo");
    assert.equal(accepted.actor_user_id, kim);
    assert.equal(accepted.detail.contentKey, "criterion_level:c-go:important>required");
    assert.equal(accepted.detail.briefRevision, 2);
    assert.equal(accepted.detail.change.to, "required");
    read = await input();
    assert.equal(read.pending, null);
    assert.deepEqual(read.answeredKeys, ["criterion_level:c-go:important>required"]);

    // An answered change is not suggested again; another one is.
    assert.equal((await create("criterion_level:c-go:important>required")).status, "answered_before");
    const second = await create("criterion_level:other:nice>important");
    assert.equal(second.status, "created");
    // A claim that failed to save is released; then the suggestion can be dismissed.
    await resolve(second.proposalId, kim, "claim");
    assert.equal((await resolve(second.proposalId, kim, "release")).status, "pending");
    const rejected = await resolve(second.proposalId, lee, "reject");
    assert.equal(rejected.status, "rejected");
    assert.equal((await decisions()).at(-1).action, "reject");
    assert.equal((await create("criterion_level:other:nice>important")).status, "answered_before");

    // The criterion changed meanwhile: stale, without a decision.
    const third = await create("criterion_level:c-go:nice>important");
    assert.equal((await resolve(third.proposalId, null, "stale")).status, "stale");
    assert.equal((await decisions()).length, 2);
    // A pending suggestion past its date expires when the next one is added or answered.
    const fourth = await create("criterion_level:a:nice>important");
    await db.query("update company_agent_update_proposals set expires_at = now() - interval '1 minute' where id = $1",
      [fourth.proposalId]);
    assert.equal((await resolve(fourth.proposalId, kim, "claim")).status, "expired");
    const fifth = await create("criterion_level:b:nice>important");
    await db.query("update company_agent_update_proposals set expires_at = now() - interval '1 minute' where id = $1",
      [fifth.proposalId]);
    assert.equal((await create("criterion_level:c:nice>important")).status, "created");
    assert.equal((await proposal(fifth.proposalId)).status, "expired");

    // Only this Role's criteria suggestions are answered here.
    assert.equal((await resolve(fourth.proposalId, kim, "reject", {}, quiet)).status, "not_found");
    await assert.rejects(resolve(fourth.proposalId, kim, "undo"), /company_brief_proposal_action_invalid/);
    // Chat and Slack confirmations still need their presented message.
    await assert.rejects(db.query(`insert into company_agent_update_proposals(workspace_id, scope_key, status, source,
      summary, preview, presentation_text, payload, message_type, expires_at)
      values ($1, 'chat:x', 'pending', 'chat', 's', 'p', 't', '{}', 'chat', now() + interval '1 day')`, [workspace]),
      /company_agent_update_proposals_delivery/);
    await assert.rejects(db.query(`insert into company_agent_update_proposals(workspace_id, scope_key, status, source, kind,
      summary, preview, presentation_text, payload, message_type, expires_at)
      values ($1, 'brief:x', 'pending', 'chat', 'criteria_refinement', 's', 'p', 't', '{}', 'chat', now() + interval '1 day')`,
      [workspace]), /company_agent_update_proposals_kind/);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    for (const signature of [
      "company_decision_consolidation_input_v1(uuid,integer)",
      "consume_company_decisions_v1(uuid,bigint)",
      "enqueue_due_company_decision_consolidations_v1(integer,integer,integer)",
      "create_company_brief_proposal_v1(uuid,uuid,text,text,integer,text,text,jsonb,timestamptz)",
      "resolve_company_brief_proposal_v1(uuid,uuid,uuid,uuid,text,jsonb)",
    ]) {
      assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true, signature);
      assert.equal(await can(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), false, signature);
    }
    // Applying the file again changes nothing.
    await db.exec(await sql(MIGRATION));
  } finally {
    await db.close();
  }
});

test("several open suggestions: replaced ones leave, the limit refuses, older web and chat proposals are unchanged", async () => {
  const OPEN_MIGRATION = "20261107060200_company_criteria_open_proposals.sql";
  const db = await setup();
  try {
    await db.exec(await sql(OPEN_MIGRATION));
    await db.exec(await sql(OPEN_MIGRATION)); // applying the file again changes nothing
    const expires = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const create = async (key: string, replaces: string[] = [], limit = 5) => (await db.query<any>(
      `select create_company_brief_proposal_v2($1, $2, 'criteria_refinement', $3, 1, 's', 'p', '{"version":1}'::jsonb, $4, $5::uuid[], $6) r`,
      [workspace, role, key, expires, replaces, limit])).rows[0].r;
    const status = async (id: string) => (await db.query<any>("select status, payload from company_agent_update_proposals where id = $1", [id])).rows[0];
    const events = async () => Number((await db.query<any>("select count(*) n from company_decision_events where subject_kind = 'proposal'")).rows[0].n);

    const ids: string[] = [];
    for (const key of ["a", "b", "c", "d", "e"]) ids.push((await create(key)).proposalId);
    assert.equal(ids.every(Boolean), true);
    const refused = await create("f");
    assert.equal(refused.status, "limit_reached");
    assert.equal((await status(ids[0])).status, "pending");

    const replaced = await create("f", [ids[0]]);
    assert.equal(replaced.status, "created");
    assert.deepEqual(replaced.replaced, [ids[0]]);
    assert.deepEqual(await status(ids[0]), { status: "superseded", payload: null });
    assert.equal(await events(), 0);

    // A suggestion a member is applying is not taken away; an id of no open suggestion replaces nothing.
    await db.query(`update company_agent_update_proposals set payload = payload || jsonb_build_object('claim', jsonb_build_object('by', $2::text, 'at', now())) where id = $1`, [ids[1], kim]);
    assert.equal((await create("g", [ids[1]])).status, "busy");
    assert.equal((await status(ids[1])).status, "pending");
    assert.equal((await create("h", [ids[0]])).status, "limit_reached");

    // The web deployed before this migration still sees one at a time.
    const older = (await db.query<any>(
      `select create_company_brief_proposal_v1($1, $2, 'criteria_refinement', 'old', 1, 's', 'p', '{"version":1}'::jsonb, $3) r`,
      [workspace, role, expires])).rows[0].r;
    assert.equal(older.status, "pending_exists");

    // Chat and Slack confirmations keep one pending per scope.
    const chat = `insert into company_agent_update_proposals(workspace_id, scope_key, status, source, summary, preview, presentation_text, payload, message_type, presented_message_id, expires_at)
      values ($1, 'chat:one', 'pending', 'chat', 's', 'p', 't', '{}', 'chat', 1, $2)`;
    await db.query(chat, [workspace, expires]);
    await assert.rejects(db.query(chat, [workspace, expires]), /one_pending/);

    const signature = "create_company_brief_proposal_v2(uuid,uuid,text,text,integer,text,text,jsonb,timestamptz,uuid[],integer)";
    const can = async (who: string) => (await db.query<any>(`select has_function_privilege('${who}', '${signature}', 'EXECUTE') ok`)).rows[0].ok;
    assert.equal(await can("service_role"), true);
    assert.equal(await can("authenticated"), false);
  } finally {
    await db.close();
  }
});

test("the open-suggestions migration stops rather than break an upsert on the one-pending index", async () => {
  const db = await setup();
  try {
    await db.exec(`create function public.upserts_proposal() returns void language sql as $$
      insert into company_agent_update_proposals(workspace_id, scope_key, status, source, summary, message_type, expires_at, payload, preview, presentation_text, presented_message_id)
      values (null, 'x', 'pending', 'chat', 's', 'chat', now(), '{}', 'p', 't', 1)
      on conflict (workspace_id, scope_key) where status = 'pending' do nothing $$`);
    await assert.rejects(db.exec(await sql("20261107060200_company_criteria_open_proposals.sql")), /upsert_depends_on_one_pending_index/);
    const { rows } = await db.query<any>("select indexdef from pg_indexes where indexname = 'company_agent_update_proposals_one_pending'");
    assert.equal(rows[0].indexdef.includes("criteria_refinement"), false);
  } finally {
    await db.close();
  }
});
