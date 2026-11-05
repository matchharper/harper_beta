import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Isolated schema smoke for the company decision record. Only the objects the
// migration reads are created; pass_company_intro_v1 is the production body and
// request_company_intro_v1 a small stand-in with the same result statuses. Like
// production, the helper functions pin search_path, because the migration's
// functions run with an empty search_path.
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
    if v_intro.close_reason = 'talent_unavailable' then return jsonb_build_object('status', 'talent_unavailable'); end if;
    update public.company_intro_candidates set status = 'awaiting_talent', requested_by_company_user_id = p_company_user_id,
      requested_at = now(), company_appeal = nullif(btrim(p_company_appeal), ''), next_stage_id = p_next_stage_id,
      revision = revision + 1 where id = v_intro.id;
    return jsonb_build_object('status', 'requested', 'introCandidateId', v_intro.id);
  end $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const actor = "10000000-0000-4000-8000-000000000003";
const talent = (n: number) => `20000000-0000-4000-8000-00000000000${n}`;
const card = (n: number) => `30000000-0000-4000-8000-00000000000${n}`;

test("company decisions are recorded once, with the decision-time Brief, beside the card change", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name) values ('${role}', '${workspace}', 'Engineer');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief one', '[]');
      insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status, close_reason) values
        ('${card(1)}', '${workspace}', '${role}', '${talent(1)}', 'ready', null),
        ('${card(2)}', '${workspace}', '${role}', '${talent(2)}', 'ready', null),
        ('${card(3)}', '${workspace}', '${role}', '${talent(3)}', 'ready', 'talent_unavailable'),
        ('${card(4)}', '${workspace}', '${role}', '${talent(4)}', 'ready', null),
        ('${card(5)}', '${workspace}', '${role}', '${talent(5)}', 'passed', null),
        ('${card(6)}', '${workspace}', '${role}', '${talent(6)}', 'ready', null),
        ('${card(7)}', '${workspace}', '${role}', '${talent(7)}', 'awaiting_talent', null);
      update company_intro_candidates set company_appeal = '분산 시스템 경험' where id = '${card(7)}';
      insert into company_messages(company_workspace_id, body) values ('${workspace}', '그 후보는 패스해 줘');
      insert into talent_progress(talent_id, role_id, company_user_id, kind, text, metadata, created_at, open_to_talent, open_to_company) values
        ('${talent(5)}', '${role}', '${actor}', 'org_company_intro_passed', '회사가 후보자 제안을 패스했습니다.',
          '{"workspaceId":"${workspace}","introCandidateId":"${card(5)}","reason":"연차 부족"}', '2026-10-20T01:00:00Z', false, false),
        ('${talent(5)}', '${role}', '${actor}', 'org_note', '연차 부족', '{"org":true,"decision":"pass"}', '2026-10-20T01:00:00Z', false, true),
        ('${talent(7)}', '${role}', '${actor}', 'org_company_intro_requested', '회사가 Intro를 요청했습니다.',
          '{"workspaceId":"${workspace}","introCandidateId":"${card(7)}"}', '2026-10-21T01:00:00Z', false, false);
    `);
    const sql = await readFile(new URL("../../../supabase/migrations/20261105020000_company_decision_events.sql", import.meta.url), "utf8");
    await db.exec(sql);

    const pass = (n: number, channel: string, reason: string | null, message: number | null) =>
      db.query<any>("select pass_company_intro_v2($1, $2, $3, $4, $5, $6) as result",
        [card(n), workspace, actor, channel, reason, message]);
    assert.equal((await pass(1, "chat", "  연봉 기대가 높아요  ", 1)).rows[0].result.status, "passed");
    assert.equal((await pass(1, "web", null, null)).rows[0].result.status, "already_passed");
    await db.exec(`update company_internal_roles set request = 'brief two' where role_id = '${role}'`);
    const requested = await db.query<any>(
      "select request_company_intro_v2($1, $2, $3, null, array['a@example.com'], $4, 'web') as result",
      [card(2), workspace, actor, " 인프라 경험이 좋아요 "]);
    assert.equal(requested.rows[0].result.status, "requested");
    const unavailable = await db.query<any>(
      "select request_company_intro_v2($1, $2, $3, null, array['a@example.com'], 'appeal', 'slack') as result",
      [card(3), workspace, actor]);
    assert.equal(unavailable.rows[0].result.status, "talent_unavailable");
    await assert.rejects(pass(4, "fax", null, null), /company_decision_events_channel_check/);
    // A message id that is not stored for this workspace (the Ops tool debugger
    // sends one) is dropped; the Pass itself still goes through.
    assert.equal((await pass(6, "chat", null, 999)).rows[0].result.status, "passed");
    assert.equal((await db.query<any>("select status from company_intro_candidates where id = $1", [card(4)])).rows[0].status, "ready");

    const events = (await db.query<any>(`select action, channel, reason_text, subject_id, intro_candidate_id,
      source_message_id, brief_version, memory_fingerprint, idempotency_key from company_decision_events
      where idempotency_key like 'company_intro:%' order by id`)).rows;
    assert.deepEqual(events.map(e => [e.action, e.channel, e.reason_text]), [
      ["pass", "chat", "연봉 기대가 높아요"],
      ["request_intro", "web", "인프라 경험이 좋아요"],
      ["pass", "chat", null],
    ]);
    assert.equal(events[2].source_message_id, null);
    assert.equal(events[0].subject_id, talent(1));
    assert.equal(events[0].intro_candidate_id, card(1));
    assert.equal(Number(events[0].source_message_id), 1);
    assert.ok(events[0].memory_fingerprint);
    assert.notEqual(events[0].brief_version, events[1].brief_version, "each row keeps the Brief of its own moment");
    const current = (await db.query<any>("select company_role_search_brief_version_v1($1) as v", [role])).rows[0].v;
    assert.equal(events[1].brief_version, current);

    const legacy = (await db.query<any>(`select action, channel, reason_text from company_decision_events
      where idempotency_key like 'legacy_progress:%' order by created_at`)).rows;
    assert.deepEqual(legacy.map(e => [e.action, e.channel, e.reason_text]), [
      ["pass", "web", "연차 부족"],
      ["request_intro", "unknown", "분산 시스템 경험"],
    ], "a backfilled request keeps the card's appeal, as live requests do");
    assert.equal((await db.query<any>("select backfill_company_intro_decisions_from_progress_v1() as n")).rows[0].n, 0);

    const activity = (await db.query<any>(
      "select id, kind, text, recommendation_id, user_id from ops_company_progress_activity_v1 order by created_at, id")).rows;
    assert.deepEqual(activity.map(a => a.kind).sort(), [
      "org_company_intro_passed", "org_company_intro_passed", "org_company_intro_passed",
      "org_company_intro_requested", "org_company_intro_requested", "org_note",
    ]);
    assert.ok(activity.filter(a => a.kind !== "org_note").every(a =>
      a.id.startsWith("company_decision:") && a.recommendation_id === null && a.user_id === null));
    assert.ok(activity.every(a => a.kind === "org_note" || !/연차|연봉/.test(a.text)), "Ops rows carry no reason text");

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can("has_table_privilege('service_role', 'company_decision_events', 'SELECT')"), true);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(await can(`has_table_privilege('service_role', 'company_decision_events', '${privilege}')`), false);
    for (const user of ["anon", "authenticated"]) {
      assert.equal(await can(`has_table_privilege('${user}', 'company_decision_events', 'SELECT')`), false);
      assert.equal(await can(`has_table_privilege('${user}', 'ops_company_progress_activity_v1', 'SELECT')`), false);
      assert.equal(await can(`has_function_privilege('${user}', 'pass_company_intro_v2(uuid,uuid,uuid,text,text,bigint)', 'EXECUTE')`), false);
    }
    assert.equal(await can("has_function_privilege('service_role', 'pass_company_intro_v2(uuid,uuid,uuid,text,text,bigint)', 'EXECUTE')"), true);
    assert.equal(await can("has_function_privilege('service_role', 'backfill_company_intro_decisions_from_progress_v1()', 'EXECUTE')"), false);
    assert.equal(await can("has_table_privilege('service_role', 'ops_company_progress_activity_v1', 'SELECT')"), true);
  } finally { await db.close(); }
});
