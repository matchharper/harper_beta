import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// The remaining company decision paths (C2): each change that is saved today
// also leaves a company decision in the same transaction. Only the objects the
// migrations read are created.
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
const role = "10000000-0000-4000-8000-000000000002";
const actor = "10000000-0000-4000-8000-000000000005";
const talent = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const suggestion = "30000000-0000-4000-8000-000000000001";
const suggestion2 = "30000000-0000-4000-8000-000000000002";
const person = "40000000-0000-4000-8000-000000000001";
const person2 = "40000000-0000-4000-8000-000000000002";

test("stage, note, view, save, rating, To-do and external decisions are recorded with their change", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name) values ('${role}', '${workspace}', 'Engineer');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
      insert into company_role_start_sessions(role_id) values ('${role}');
      insert into talent_users(user_id) values ('${talent}'), ('${other}');
      insert into company_todo_suggestions(id, company_workspace_id, role_id, kind, title) values
        ('${suggestion}', '${workspace}', '${role}', 'follow_up', 'Follow up'),
        ('${suggestion2}', '${workspace}', '${role}', 'widen', 'Widen');
      insert into external_candidates(id, company_workspace_id, role_id) values
        ('${person}', '${workspace}', '${role}'), ('${person2}', '${workspace}', '${role}');
    `);
    for (const name of ["20261105020000_company_decision_events.sql", "20261105100000_company_decision_paths.sql"])
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const progress = (kind: string, metadata: object, extra = "") => db.exec(`
      insert into talent_progress(talent_id, role_id, company_user_id, kind, text, metadata${extra ? ", id" : ""})
      values ('${talent}', '${role}', ${kind === "ops" ? "null" : `'${actor}'`}, '${kind === "ops" ? "org_stage_change" : kind}',
        'text', '${JSON.stringify(metadata)}'${extra ? `, '${extra}'` : ""});`);
    // Company moves from each surface; a stop keeps its note as the reason.
    await progress("org_stage_change", { stage: "interview", previousStage: "connected", decisionChannel: "web" });
    await progress("org_stage_change", { stage: "process_stopped", stopNote: "다른 후보로 결정", decisionChannel: "slack" });
    await progress("org_stage_change", { stage: "connected", decisionChannel: "email", acceptReason: "좋은 경험" });
    // Not company decisions: a move that follows the candidate, and an Ops review move.
    await progress("org_stage_change", { stage: "connected", decisionChannel: "system" });
    await progress("ops", { stage: "hold", source: "ops_matching_review" });
    // A writer that forgot the channel still shows up.
    await progress("org_stage_change", { stage: "interview" });
    // Notes are not decisions (they get their own table).
    await progress("org_note", { org: true });
    await progress("org_candidate_profile_first_view", { source: "slack" });
    // Save, save again (no change), unsave.
    const saveId = "50000000-0000-4000-8000-000000000001";
    const save = (saved: boolean, at: string) => db.exec(`
      insert into talent_progress(id, talent_id, role_id, kind, text, created_at, metadata)
      values ('${saveId}', '${talent}', '${role}', 'org_candidate_saved', 'x', '${at}',
        '{"saved":${saved},"actorUserId":"${actor}","stage":"inbox"}')
      on conflict (id) do update set metadata = excluded.metadata, created_at = excluded.created_at;`);
    await save(true, "2026-11-05T01:00:00Z");
    await save(true, "2026-11-05T01:01:00Z");
    await save(false, "2026-11-05T01:02:00Z");

    // First-three ratings: a new rating and a changed one are decisions; unchanged ones are not.
    const rate = (talentId: string, entry: object) => db.exec(`update company_role_start_sessions
      set evaluations = evaluations || jsonb_build_object('${talentId}', '${JSON.stringify(entry)}'::jsonb), revision = revision + 1
      where role_id = '${role}';`);
    await rate(talent, { rating: "bad", reasonText: "경력이 짧음", note: "면접 메모", answer: "답", by: actor, at: "1" });
    await rate(other, { rating: "good", by: actor, at: "2" });
    await rate(talent, { rating: "uncertain", by: actor, at: "3" });

    // To-do: approve one; dismiss and stop the other kind.
    await db.exec(`update company_todo_suggestions set status = 'approved', decided_by = '${actor}' where id = '${suggestion}';`);
    await db.exec(`update company_todo_suggestions set status = 'approved' where id = '${suggestion}';`);
    await db.exec(`begin;
      update company_todo_suggestions set status = 'dismissed', decided_by = '${actor}' where id = '${suggestion2}';
      insert into company_todo_suggestion_mutes(company_workspace_id, role_id, kind, created_by)
        values ('${workspace}', '${role}', 'widen', '${actor}');
      commit;`);

    // External: request from chat, then Pass from the web; a second Pass changes nothing.
    const external = async (id: string, decision: string, reason: string, channel: string) => (await db.query<any>(
      "select set_external_candidate_company_decision_v1($1, $2, $3, $4, $5, $6) ok",
      [id, workspace, decision, actor, reason, channel])).rows[0].ok;
    assert.equal(await external(person, "intro_requested", "꼭 만나고 싶어요", "chat"), true);
    assert.equal(await external(person, "passed", "  방향이 달라요 ", "web"), true);
    assert.equal(await external(person, "passed", "again", "web"), false);
    const state = (await db.query<any>("select company_decision, company_decision_reason, company_decided_by from external_candidates where id = $1", [person])).rows[0];
    assert.deepEqual(state, { company_decision: "passed", company_decision_reason: "방향이 달라요", company_decided_by: actor });
    await assert.rejects(external(person2, "maybe", "", "web"), /external_candidate_decision_invalid/);

    const rows = (await db.query<any>(`select subject_kind, subject_id, action, channel, actor_user_id, reason_text, detail
      from company_decision_events order by id`)).rows;
    const brief = rows.map(r => [r.subject_kind, r.action, r.channel, r.reason_text]);
    assert.deepEqual(brief, [
      ["member_candidate", "stage_change", "web", null],
      ["member_candidate", "stop", "slack", "다른 후보로 결정"],
      ["member_candidate", "stage_change", "email", "좋은 경험"],
      ["member_candidate", "stage_change", "unknown", null],
      ["member_candidate", "view", "slack", null],
      ["member_candidate", "save", "web", null],
      ["member_candidate", "unsave", "web", null],
      ["member_candidate", "rate", "role_start", "경력이 짧음"],
      ["member_candidate", "rate", "role_start", null],
      ["member_candidate", "rate", "role_start", null],
      ["todo_suggestion", "accept", "todo", null],
      ["todo_suggestion", "reject", "todo", null],
      ["suggestion_kind", "mute", "todo", null],
      ["external_candidate", "request_intro", "chat", "꼭 만나고 싶어요"],
      ["external_candidate", "pass", "web", "방향이 달라요"],
    ]);
    assert.ok(rows.every(r => r.actor_user_id === actor));
    assert.equal(rows[0].detail.stage, "interview");
    assert.equal(rows[0].detail.previousStage, "connected");
    assert.equal(rows[7].subject_id, talent);
    assert.equal(rows[7].detail.rating, "bad");
    assert.equal(rows[8].subject_id, other);
    assert.equal(rows[9].detail.rating, "uncertain");
    assert.equal(rows[12].detail.kind, "widen");
    assert.equal(rows[14].subject_id, person);

    // The Talent account goes (account deletion marks deleted_at; the row
    // stays): every reason about the person is erased; the rows stay.
    const reasons = async (id: string) => (await db.query<any>(`select count(*)::int n from company_decision_events
      where subject_id = '${id}' and reason_text is not null`)).rows[0].n;
    const redacted = async (id: string) => (await db.query<any>(`select count(*)::int n from company_decision_events
      where subject_id = '${id}' and detail ? 'redacted'`)).rows[0].n;
    await db.exec(`update talent_users set deleted_at = now() where user_id = '${talent}';`);
    assert.equal(await reasons(talent), 0);
    assert.equal((await db.query<any>(`select count(*)::int n from company_decision_events
      where subject_id = '${talent}' and detail ?| array['note', 'answer', 'reasons']`)).rows[0].n, 0);
    assert.equal(await redacted(talent), 3);
    assert.equal(await redacted(other), 0);
    // A reason recorded after the deletion is not kept either.
    await db.query(`select record_company_decision_v1('${workspace}', '${role}', 'member_candidate', '${talent}',
      'stop', 'web', '${actor}', 'after-deletion', null, 'late reason')`);
    assert.equal(await reasons(talent), 0);
    assert.equal(await redacted(talent), 4);
    // A deleted row (not only the mark) erases them too.
    await db.exec(`delete from talent_users where user_id = '${other}';`);
    assert.equal(await reasons(other), 0);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const fn = "set_external_candidate_company_decision_v1(uuid,uuid,text,uuid,text,text)";
    assert.equal(await can(`has_function_privilege('service_role', '${fn}', 'EXECUTE')`), true);
    assert.equal(await can(`has_function_privilege('authenticated', '${fn}', 'EXECUTE')`), false);
    for (const trigger of ["record_company_progress_decision_v1()", "record_company_role_start_rating_v1()", "record_company_todo_decision_v1()"])
      assert.equal(await can(`has_function_privilege('service_role', '${trigger}', 'EXECUTE')`), false);

    // Withdrawal no longer erases the company's reasons; old erasures stay.
    const leaving = "20000000-0000-4000-8000-000000000009";
    await db.exec(`insert into talent_users(user_id) values ('${leaving}');`);
    await db.query(`select record_company_decision_v1('${workspace}', '${role}', 'member_candidate', '${leaving}',
      'stop', 'web', '${actor}', 'before-withdrawal', null, 'kept reason')`);
    const keep = await readFile(new URL("../../../supabase/migrations/20261109010000_keep_company_records_on_talent_withdrawal.sql", import.meta.url), "utf8");
    await db.exec(keep);
    await db.exec(keep);
    await db.exec(`update talent_users set deleted_at = now() where user_id = '${leaving}';`);
    assert.equal(await reasons(leaving), 1);
    assert.equal(await redacted(leaving), 0);
    await db.query(`select record_company_decision_v1('${workspace}', '${role}', 'member_candidate', '${talent}',
      'stop', 'web', '${actor}', 'after-withdrawal', null, 'recorded later')`);
    assert.equal(await reasons(talent), 1);
    assert.equal(await redacted(talent), 4);
    assert.equal(await reasons(other), 0);
  } finally { await db.close(); }
});
