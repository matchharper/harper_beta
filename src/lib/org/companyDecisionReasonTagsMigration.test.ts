import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Every decision path keeps its reason tags and source message (S2). Only the
// objects the migrations read are created, as in the C1/C2 migration tests.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    scope text, role_id uuid, team_id uuid, content text, deleted_at timestamptz);
  create table company_memories(id bigint generated always as identity primary key, company_workspace_id uuid,
    role_id uuid, content text);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(),
    open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(jsonb_build_object('entries', (select jsonb_agg(to_jsonb(m) order by m.id) from company_memory_entries m
      where m.company_workspace_id = r.company_workspace_id and m.deleted_at is null), 'legacyRole', i.memory)::text)
    from company_roles r join company_internal_roles i using(role_id) where r.role_id = p_role $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
  declare v_intro public.company_intro_candidates%rowtype;
  begin
    select intro.* into v_intro from public.company_intro_candidates intro
    where intro.id = p_intro_candidate_id and intro.company_workspace_id = p_company_workspace_id for update;
    if v_intro.id is null then raise exception using errcode = 'P0002', message = 'company_intro_not_found'; end if;
    if v_intro.status = 'passed' then return jsonb_build_object('status', 'already_passed', 'introCandidateId', v_intro.id); end if;
    if v_intro.status <> 'ready' then raise exception using errcode = 'P0001', message = 'company_intro_not_passable'; end if;
    update public.company_intro_candidates set status = 'passed', close_reason = 'company_passed',
      requested_by_company_user_id = p_company_user_id, revision = revision + 1, updated_at = now()
    where id = v_intro.id;
    return jsonb_build_object('status', 'passed', 'introCandidateId', v_intro.id);
  end $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language plpgsql security definer set search_path to '' as $$
  declare v_intro public.company_intro_candidates%rowtype;
  begin
    select * into v_intro from public.company_intro_candidates where id = p_intro_candidate_id for update;
    if v_intro.status = 'awaiting_talent' then return jsonb_build_object('status', 'already_requested'); end if;
    update public.company_intro_candidates set status = 'awaiting_talent', requested_by_company_user_id = p_company_user_id,
      requested_at = now(), company_appeal = nullif(btrim(p_company_appeal), ''), next_stage_id = p_next_stage_id,
      revision = revision + 1 where id = v_intro.id;
    return jsonb_build_object('status', 'requested', 'introCandidateId', v_intro.id);
  end $$;
  create table talent_users(user_id uuid primary key, deleted_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, evaluations jsonb not null default '{}',
    revision int not null default 0);
  create table company_todo_suggestions(id uuid primary key, company_workspace_id uuid, role_id uuid, kind text, title text,
    plan text, status text not null default 'pending', decided_at timestamptz, decided_by uuid, updated_at timestamptz);
  create table company_todo_suggestion_mutes(company_workspace_id uuid, role_id uuid, kind text, created_by uuid,
    created_at timestamptz not null default now(), primary key (role_id, kind));
  create table external_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, company_decision text,
    company_decision_reason text, company_decided_at timestamptz, company_decided_by uuid, updated_at timestamptz);
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "10000000-0000-4000-8000-000000000009";
const role = "10000000-0000-4000-8000-000000000002";
const actor = "10000000-0000-4000-8000-000000000005";
const talent = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const card = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;
const MIGRATIONS = [
  "20261105020000_company_decision_events.sql",
  "20261105100000_company_decision_paths.sql",
  "20261107020000_company_decision_reason_tags.sql",
];

async function setup() {
  const db = new PGlite();
  await db.exec(SETUP);
  await db.exec(`
    insert into company_workspace values ('${workspace}', 'Company'), ('${otherWorkspace}', 'Other');
    insert into company_roles(role_id, company_workspace_id, name) values ('${role}', '${workspace}', 'Engineer');
    insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
    insert into talent_users(user_id) values ('${talent(1)}'), ('${talent(2)}'), ('${talent(3)}');
    insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status) values
      ('${card(1)}', '${workspace}', '${role}', '${talent(1)}', 'ready'),
      ('${card(2)}', '${workspace}', '${role}', '${talent(2)}', 'ready'),
      ('${card(3)}', '${workspace}', '${role}', '${talent(3)}', 'ready');
    insert into company_messages(company_workspace_id, body) values
      ('${workspace}', '이 후보는 종료해 줘'), ('${otherWorkspace}', 'elsewhere');
  `);
  for (const name of MIGRATIONS)
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
  return db;
}

const progress = (db: PGlite, talentId: string, kind: string, metadata: object, id?: string) => db.query(
  `insert into talent_progress(${id ? "id, " : ""}talent_id, role_id, company_user_id, kind, text, metadata)
   values (${id ? "$4, " : ""}$1, '${role}', '${actor}', $2, 'text', $3::jsonb)`,
  id ? [talentId, kind, JSON.stringify(metadata), id] : [talentId, kind, JSON.stringify(metadata)]);

test("stage changes, stops and saves carry reason tags, the source message and the decision key", async () => {
  const db = await setup();
  try {
    // Chat move with a reason, tags (trimmed, deduplicated) and the message.
    await progress(db, talent(1), "org_stage_change", {
      stage: "custom:interview", previousStage: "connected", decisionChannel: "chat",
      acceptReason: "좋은 경험", reasonTags: ["c1", "  c2 ", "c1", ""], sourceMessageId: 1,
    });
    // Web stop from the dispatcher with a decision key.
    await progress(db, talent(2), "org_stage_change", {
      stage: "process_stopped", decisionChannel: "web", stopNote: "다른 후보로 결정",
      notifyCandidateOnClosure: false, reasonTags: ["c2"], sourceMessageId: null, decisionKey: "member:t2:k1",
    });
    // A retried request with the same key is the same decision.
    await progress(db, talent(2), "org_stage_change", {
      stage: "process_stopped", decisionChannel: "web", stopNote: "again", decisionKey: "member:t2:k1",
    });
    // Rows written before this change (no new keys) are recorded as before.
    const legacyId = "50000000-0000-4000-8000-000000000001";
    await progress(db, talent(3), "org_stage_change", { stage: "connected", decisionChannel: "email" }, legacyId);
    // A message of another workspace or a malformed id is not kept.
    await progress(db, talent(3), "org_stage_change", { stage: "connected", decisionChannel: "slack", sourceMessageId: 2 });
    await progress(db, talent(3), "org_stage_change", { stage: "connected", decisionChannel: "chat", sourceMessageId: "1; drop" });
    await progress(db, talent(3), "org_stage_change", { stage: "connected", decisionChannel: "chat", reasonTags: "c1" });
    // Moves that follow the candidate are still not company decisions.
    await progress(db, talent(3), "org_stage_change", { stage: "connected", decisionChannel: "system", reasonTags: ["c1"] });
    // Save from chat with its message and key; unsave from the web as before.
    const saveId = "50000000-0000-4000-8000-000000000002";
    await db.query(`insert into talent_progress(id, talent_id, role_id, kind, text, metadata)
      values ($1, $2, '${role}', 'org_candidate_saved', 'saved', $3::jsonb)`, [saveId, talent(1), JSON.stringify({
        saved: true, actorUserId: actor, stage: "pending_connection", decisionChannel: "chat",
        sourceMessageId: 1, decisionKey: "member:t1:s1" })]);
    await db.query(`update talent_progress set metadata = $2::jsonb, created_at = now() + interval '1 minute' where id = $1`,
      [saveId, JSON.stringify({ saved: false, actorUserId: actor, stage: "pending_connection" })]);

    const rows = (await db.query<any>(`select action, channel, reason_text, reason_tags, source_message_id,
      idempotency_key, detail from company_decision_events order by id`)).rows;
    assert.deepEqual(rows.map(r => [r.action, r.channel, r.reason_text, r.reason_tags,
      r.source_message_id === null ? null : Number(r.source_message_id)]), [
      ["stage_change", "chat", "좋은 경험", ["c1", "c2"], 1],
      ["stop", "web", "다른 후보로 결정", ["c2"], null],
      ["stage_change", "email", null, [], null],
      ["stage_change", "slack", null, [], null],
      ["stage_change", "chat", null, [], null],
      ["stage_change", "chat", null, [], null],
      ["save", "chat", null, [], 1],
      ["unsave", "web", null, [], null],
    ]);
    assert.equal(rows[1].idempotency_key, "decision:member:t2:k1");
    assert.equal(rows[1].detail.notifyCandidateOnClosure, false);
    assert.equal(rows[2].idempotency_key, `progress:${legacyId}`);
    assert.equal(rows[6].idempotency_key, "decision:member:t1:s1");
    assert.match(rows[7].idempotency_key, new RegExp(`^progress:${saveId}:unsave:`));
    // Both progress rows of the retried stop stay; only one decision.
    assert.equal((await db.query<any>(`select count(*)::int n from talent_progress where talent_id = $1`, [talent(2)])).rows[0].n, 2);
  } finally { await db.close(); }
});

test("pass_company_intro_v3 records tags and the message; v2 and requests keep working", async () => {
  const db = await setup();
  try {
    const v3 = (n: number, tags: unknown, message: number | null) => db.query<any>(
      "select pass_company_intro_v3($1, $2, $3, 'chat', '  연봉 기대가 높아요 ', $4, $5) as result",
      [card(n), workspace, actor, message, tags]);
    const first = (await v3(1, ["c1", " c1", "", "c3"], 1)).rows[0].result;
    assert.equal(first.status, "passed");
    assert.ok(first.decisionId);
    assert.equal((await v3(1, ["c9"], 1)).rows[0].result.status, "already_passed");
    // Without tags (default) it records an empty list.
    await db.query("select pass_company_intro_v3($1, $2, $3, 'web')", [card(3), workspace, actor]);
    // v2 is unchanged for role start and the web before this deploy.
    await db.query("select pass_company_intro_v2($1, $2, $3, 'role_start', null, null)", [card(2), workspace, actor]);
    await db.exec(`update company_intro_candidates set status = 'ready' where id = '${card(2)}'`);
    await db.exec(`insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status)
      values ('${card(4)}', '${workspace}', '${role}', '${talent(3)}', 'ready')`);
    await db.query("select request_company_intro_v2($1, $2, $3, null, array['a@example.com'], '분산 시스템', 'chat', 1)",
      [card(4), workspace, actor]);

    const rows = (await db.query<any>(`select action, channel, reason_text, reason_tags, source_message_id
      from company_decision_events order by id`)).rows;
    assert.deepEqual(rows.map(r => [r.action, r.channel, r.reason_text, r.reason_tags,
      r.source_message_id === null ? null : Number(r.source_message_id)]), [
      ["pass", "chat", "연봉 기대가 높아요", ["c1", "c3"], 1],
      ["pass", "web", null, [], null],
      ["pass", "role_start", null, [], null],
      ["request_intro", "chat", "분산 시스템", [], 1],
    ]);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const fn = "pass_company_intro_v3(uuid,uuid,uuid,text,text,bigint,text[])";
    assert.equal(await can(`has_function_privilege('service_role', '${fn}', 'EXECUTE')`), true);
    for (const user of ["anon", "authenticated"])
      assert.equal(await can(`has_function_privilege('${user}', '${fn}', 'EXECUTE')`), false);
    assert.equal(await can("has_function_privilege('service_role', 'record_company_progress_decision_v1()', 'EXECUTE')"), false);
    // The migration can run again.
    await db.exec(await readFile(new URL(`../../../supabase/migrations/${MIGRATIONS[2]}`, import.meta.url), "utf8"));
  } finally { await db.close(); }
});
