import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Earlier company decisions kept only in talent_progress are copied into the
// decision record once, with their original time. Only the objects the
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
  create table talent_users(user_id uuid primary key);
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

test("earlier stage changes, first views and saves are copied once with their time", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name) values ('${role}', '${workspace}', 'Engineer');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
      insert into talent_users values ('${talent}');
      insert into talent_progress(talent_id, role_id, company_user_id, kind, text, metadata, created_at) values
        ('${talent}', '${role}', '${actor}', 'org_stage_change', 's', '{"stage":"process_stopped","stopNote":"filled"}', '2026-10-01T00:00:00Z'),
        ('${talent}', '${role}', '${actor}', 'org_stage_change', 's', '{"stage":"connected","decisionChannel":"system"}', '2026-10-02T00:00:00Z'),
        ('${talent}', '${role}', null, 'org_stage_change', 's', '{"stage":"archived","source":"ops_matching_review"}', '2026-10-03T00:00:00Z'),
        ('${talent}', '${role}', '${actor}', 'org_candidate_profile_first_view', 'v', '{"source":"slack"}', '2026-10-04T00:00:00Z'),
        ('${talent}', '${role}', null, 'org_candidate_saved', 'x', '{"saved":true,"actorUserId":"${actor}"}', '2026-10-05T00:00:00Z');
    `);
    const migration = async (name: string) =>
      db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await migration("20261105020000_company_decision_events.sql");
    await migration("20261105100000_company_decision_paths.sql");
    await migration("20261105150000_company_record_backfill.sql");

    const rows = async () => (await db.query<any>(`select action, channel, actor_user_id, reason_text, created_at, detail
      from company_decision_events order by created_at`)).rows;
    let copied = await rows();
    assert.deepEqual(copied.map(r => [r.action, r.channel, r.reason_text]), [
      ["stop", "unknown", "filled"], ["view", "slack", null], ["save", "unknown", null],
    ]);
    assert.ok(copied.every(r => r.actor_user_id === actor && r.detail.backfill === true));
    assert.equal(new Date(copied[0].created_at).toISOString(), "2026-10-01T00:00:00.000Z");

    // A live stage change after the paths PR, then the copy again: nothing doubles.
    await db.exec(`insert into talent_progress(talent_id, role_id, company_user_id, kind, text, metadata)
      values ('${talent}', '${role}', '${actor}', 'org_stage_change', 's', '{"stage":"interview","decisionChannel":"web"}');`);
    await migration("20261105150000_company_record_backfill.sql");
    copied = await rows();
    assert.deepEqual(copied.map(r => [r.action, r.channel]), [
      ["stop", "unknown"], ["view", "slack"], ["save", "unknown"], ["stage_change", "web"],
    ]);
  } finally { await db.close(); }
});
