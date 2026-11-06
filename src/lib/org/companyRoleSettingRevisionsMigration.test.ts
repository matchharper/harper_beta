import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Role setting versions (D19): every settings change of a Harper-managed role
// leaves one immutable version in the same transaction, beside Brief versions.
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
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid,
    scope text, role_id uuid, team_id uuid, content text, deleted_at timestamptz);
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
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const external = "10000000-0000-4000-8000-000000000004";
const actor = "10000000-0000-4000-8000-000000000005";

test("every settings change leaves one version per transaction, readable at any moment", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values
        ('${role}', '${workspace}', 'Engineer', 'internal'), ('${external}', '${workspace}', 'Posting', 'external');
      insert into company_internal_roles(role_id, request, criteria, memory, max_pending_talents) values
        ('${role}', 'brief one', '[]', 'old memory', 3);
    `);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105090100_company_role_setting_revisions.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const revisions = async (id: string) => (await db.query<any>(
      "select revision, source, actor_user_id, snapshot from company_role_setting_revisions where role_id = $1 order by revision",
      [id])).rows;
    const moment = async () => (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;

    // Version 1: settings only, without the Brief, Memory or timestamps.
    const first = await revisions(role);
    assert.deepEqual(first.map(r => [r.revision, r.source]), [[1, "migration"]]);
    assert.equal(first[0].snapshot.status, "active");
    assert.equal(first[0].snapshot.max_pending_talents, 3);
    assert.equal(first[0].snapshot.is_anonymous, false);
    for (const key of ["request", "criteria", "memory", "updated_at", "created_at", "role_id"])
      assert.equal(key in first[0].snapshot, false, key);
    const afterMigration = await moment();

    // Brief, Memory and timestamp writes add no settings version.
    await db.exec(`update company_internal_roles set request = 'brief two', memory = 'new memory', updated_at = now()
      where role_id = '${role}';`);
    assert.equal((await revisions(role)).length, 1);

    // An attributed change, then one transaction with two settings and the role turned off.
    await db.exec(`begin;
      select set_config('harper.hiring_brief_change_context', '{"source":"web","actorUserId":"${actor}"}', true);
      update company_internal_roles set is_anonymous = true where role_id = '${role}';
      commit;`);
    const afterAnonymous = await moment();
    await db.exec(`begin;
      update company_internal_roles set max_pending_talents = 5 where role_id = '${role}';
      update company_roles set status = 'paused' where role_id = '${role}';
      commit;`);
    // Same values, a change reverted in one transaction, and an external role add nothing.
    await db.exec(`update company_roles set status = 'paused' where role_id = '${role}';`);
    await db.exec(`begin;
      update company_internal_roles set is_anonymous = false where role_id = '${role}';
      update company_internal_roles set is_anonymous = true where role_id = '${role}';
      commit;`);
    await db.exec(`update company_roles set status = 'ended' where role_id = '${external}';`);
    const rows = await revisions(role);
    assert.deepEqual(rows.map(r => [r.revision, r.source]), [[1, "migration"], [2, "web"], [3, null]]);
    assert.equal(rows[1].actor_user_id, actor);
    assert.equal(rows[2].snapshot.status, "paused");
    assert.equal(rows[2].snapshot.max_pending_talents, 5);
    assert.deepEqual(await revisions(external), []);

    // Point-in-time reads carry both the Brief and the settings of the moment.
    const asOf = async (at: string) =>
      (await db.query<any>("select company_role_state_as_of_v1($1, $2) s", [role, at])).rows[0].s;
    assert.equal((await asOf(afterMigration)).settings.revision, 1);
    assert.equal((await asOf(afterMigration)).brief.snapshot.search.request, "brief one");
    assert.equal((await asOf(afterAnonymous)).settings.snapshot.is_anonymous, true);
    assert.equal((await asOf(afterAnonymous)).brief.snapshot.search.request, "brief two");
    assert.equal((await asOf(await moment())).settings.snapshot.status, "paused");
    assert.equal((await asOf("2000-01-01T00:00:00Z")).settings, null);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can("has_table_privilege('service_role', 'company_role_setting_revisions', 'SELECT')"), true);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(await can(`has_table_privilege('service_role', 'company_role_setting_revisions', '${privilege}')`), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_role_setting_revisions', 'SELECT')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'company_role_state_as_of_v1(uuid,timestamptz)', 'EXECUTE')"), true);
    assert.equal(await can("has_function_privilege('authenticated', 'company_role_state_as_of_v1(uuid,timestamptz)', 'EXECUTE')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'capture_company_role_setting_revision_v1(uuid)', 'EXECUTE')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_role_setting_revisions')"), true);
  } finally { await db.close(); }
});
