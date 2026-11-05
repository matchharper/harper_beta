import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Company memory versions (D19): every memory change is kept, numbered per
// company; decisions and evaluations record the version they were made with,
// and one function reads a role's memory now or at a version.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    updated_at timestamptz, status text default 'active', priority smallint);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text, is_anonymous boolean default false, max_pending_talents int, updated_at timestamptz,
    role_status_changed_at timestamptz, created_at timestamptz default now());
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'name', r.name, 'request', ir.request, 'criteria', ir.criteria,
      'location', r.location_text)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select md5(coalesce((select i.memory from company_internal_roles i where i.role_id = p_role), '')) $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
  begin
    update public.company_intro_candidates set status = 'passed', requested_by_company_user_id = p_company_user_id,
      revision = revision + 1 where id = p_intro_candidate_id and status = 'ready';
    if not found then return jsonb_build_object('status', 'already_passed'); end if;
    return jsonb_build_object('status', 'passed', 'introCandidateId', p_intro_candidate_id);
  end $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid not null,
    scope text not null, team_id uuid, role_id uuid, label text not null default '', content text not null,
    revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    deleted_at timestamptz);
  create table company_role_candidate_evaluations(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, talent_id uuid, stage int);
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000009";
const role = "10000000-0000-4000-8000-000000000002";
const role2 = "10000000-0000-4000-8000-000000000003";
const team = "10000000-0000-4000-8000-000000000007";
const actor = "10000000-0000-4000-8000-000000000005";
const talent = "20000000-0000-4000-8000-000000000001";

test("memory changes are versions, readable per role now or at a version", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company'), ('${other}', 'Other');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values
        ('${role}', '${workspace}', 'Engineer', 'internal'), ('${role2}', '${workspace}', 'Designer', 'internal');
      insert into company_internal_roles(role_id, request, criteria, team_id) values
        ('${role}', 'brief', '[]', '${team}'), ('${role2}', 'brief', '[]', null);
    `);
    // An entry saved before versions existed.
    await db.exec(`insert into company_memory_entries(company_workspace_id, scope, content, updated_at)
      values ('${other}', 'company', 'saved before versions', '2026-01-01T00:00:00Z');`);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105090000_company_role_setting_revisions.sql",
      "20261105130000_company_memory_revisions.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const version = async () => Number((await db.query<any>(
      "select company_memory_version_v1($1) v", [workspace])).rows[0].v);
    const memory = async (r: string, v: number | null = null) => (await db.query<any>(
      "select scope, content, memory_version from company_memory_for_role_v1($1, $2)", [r, v])).rows
      .map(x => [x.scope, x.content]);
    assert.equal(await version(), 0);
    // It starts with its current state, at its last save time.
    const early = (await db.query<any>("select content, changed_at from company_memory_for_workspace_v1($1)", [other])).rows;
    assert.deepEqual(early.map((x: any) => x.content), ["saved before versions"]);
    assert.equal(new Date(early[0].changed_at).toISOString(), "2026-01-01T00:00:00.000Z");

    // Company, team and role memory; another company's memory never counts.
    await db.exec(`insert into company_memory_entries(company_workspace_id, scope, content, source) values
        ('${workspace}', 'company', 'remote first', 'chat');
      insert into company_memory_entries(company_workspace_id, scope, team_id, content) values ('${workspace}', 'team', '${team}', 'team ships weekly');
      insert into company_memory_entries(company_workspace_id, scope, role_id, content) values ('${workspace}', 'role', '${role}', 'needs Go');
      insert into company_memory_entries(company_workspace_id, scope, content) values ('${other}', 'company', 'other company');`);
    const v1 = await version();
    assert.deepEqual(await memory(role), [["company", "remote first"], ["team", "team ships weekly"], ["role", "needs Go"]]);
    assert.deepEqual(await memory(role2), [["company", "remote first"]]);
    // The whole company's memory, with when each entry was saved.
    const all = (await db.query<any>("select scope, content, changed_at from company_memory_for_workspace_v1($1)", [workspace])).rows;
    assert.deepEqual(all.map((x: any) => x.scope), ["company", "team", "role"]);
    assert.ok(all.every((x: any) => x.changed_at));
    assert.equal(await can("has_function_privilege('service_role', 'company_memory_for_workspace_v1(uuid,bigint)', 'EXECUTE')"), true);

    // A decision and an evaluation record the version they were made with.
    await db.query(`select record_company_decision_v1($1, $2, 'member_candidate', $3, 'pass', 'web', $4, 'k1')`,
      [workspace, role, talent, actor]);
    await db.exec(`insert into company_role_candidate_evaluations(company_workspace_id, role_id, talent_id, stage)
      values ('${workspace}', '${role}', '${talent}', 1);`);

    // An edit and a deletion are new versions; an unchanged save is not.
    await db.exec(`update company_memory_entries set content = 'needs Go or Rust', revision = 2 where content = 'needs Go';
      update company_memory_entries set updated_at = now() where content = 'remote first';
      update company_memory_entries set deleted_at = now() where content = 'team ships weekly';`);
    assert.equal(await version() > v1, true);
    assert.equal((await db.query<any>("select count(*)::int n from company_memory_revisions where company_workspace_id = $1",
      [workspace])).rows[0].n, 5);
    assert.deepEqual(await memory(role), [["company", "remote first"], ["role", "needs Go or Rust"]]);
    // What the decision saw is still readable.
    const pinned = Number((await db.query<any>("select memory_version from company_decision_events where idempotency_key = 'k1'")).rows[0].memory_version);
    assert.equal(pinned, v1);
    assert.deepEqual(await memory(role, pinned), [["company", "remote first"], ["team", "team ships weekly"], ["role", "needs Go"]]);
    assert.equal(Number((await db.query<any>("select source_company_memory_version v from company_role_candidate_evaluations")).rows[0].v), v1);
    // A decision copied in later with an earlier time gets the memory of that time.
    await db.exec(`insert into company_decision_events(company_workspace_id, role_id, subject_kind, subject_id, action,
      channel, idempotency_key, created_at) values ('${workspace}', '${role}', 'member_candidate', '${talent}', 'pass',
      'unknown', 'old', '2000-01-01T00:00:00Z');`);
    assert.equal(Number((await db.query<any>("select memory_version from company_decision_events where idempotency_key = 'old'")).rows[0].memory_version), 0);

    // Point-in-time reads carry the memory of the moment.
    const now = (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;
    const state = (await db.query<any>("select company_role_state_as_of_v1($1, $2) s", [role, now])).rows[0].s;
    assert.deepEqual(state.memory.entries.map((e: any) => e.content), ["remote first", "needs Go or Rust"]);
    assert.equal(state.settings.revision, 1);
    assert.equal((await db.query<any>("select company_role_state_as_of_v1($1, '2000-01-01') s", [role])).rows[0].s.memory.version, 0);

    assert.equal(await can("has_table_privilege('service_role', 'company_memory_revisions', 'SELECT')"), true);
    assert.equal(await can("has_table_privilege('service_role', 'company_memory_revisions', 'INSERT')"), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_memory_revisions', 'SELECT')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'company_memory_for_role_v1(uuid,bigint)', 'EXECUTE')"), true);
    assert.equal(await can("has_function_privilege('authenticated', 'company_memory_for_role_v1(uuid,bigint)', 'EXECUTE')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_memory_revisions')"), true);
  } finally { await db.close(); }
});
