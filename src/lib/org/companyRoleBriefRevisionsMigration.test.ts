import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Brief versions (D19): every Brief change of a Harper-managed role leaves one
// immutable version in the same transaction. Only the objects the migrations
// read are created; helper functions pin search_path as in production.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    updated_at timestamptz);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text);
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
const newRole = "10000000-0000-4000-8000-000000000003";
const external = "10000000-0000-4000-8000-000000000004";
const actor = "10000000-0000-4000-8000-000000000005";
const card = "30000000-0000-4000-8000-000000000001";

test("every Brief change leaves one version per transaction, readable at any moment", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, location_text, source_type) values
        ('${role}', '${workspace}', 'Engineer', 'Seoul', 'internal'),
        ('${newRole}', '${workspace}', 'Designer', 'Seoul', 'internal'),
        ('${external}', '${workspace}', 'Posting', 'Seoul', 'external');
      insert into company_internal_roles(role_id, request, criteria) values
        ('${role}', 'brief one', '[]'), ('${newRole}', null, '[]');
      insert into company_role_start_sessions values ('${newRole}', '{"summary":"first"}');
      insert into company_intro_candidates(id, company_workspace_id, role_id, talent_id, status) values
        ('${card}', '${workspace}', '${role}', '${actor}', 'ready');
    `);
    for (const name of ["20261105020000_company_decision_events.sql", "20261105080000_company_role_brief_revisions.sql"])
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const revisions = async (id: string) => (await db.query<any>(
      "select revision, source, actor_user_id, legacy_brief_version, snapshot from company_role_brief_revisions where role_id = $1 order by revision",
      [id])).rows;
    const version = async (id: string) =>
      (await db.query<any>("select company_role_search_brief_version_v1($1) v", [id])).rows[0].v;

    // Version 1 for every Harper-managed role, matching today's brief_version.
    assert.deepEqual((await revisions(role)).map(r => [r.revision, r.source]), [[1, "migration"]]);
    assert.equal((await revisions(role))[0].legacy_brief_version, await version(role));
    assert.equal((await revisions(newRole))[0].snapshot.sessionBrief.summary, "first");
    assert.deepEqual(await revisions(external), []);
    const afterMigration = (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;

    // An attributed save from chat.
    await db.exec(`begin;
      select set_config('harper.hiring_brief_change_context', '{"source":"chat","actorUserId":"${actor}"}', true);
      update company_internal_roles set request = 'brief two' where role_id = '${role}';
      commit;`);
    const afterSecond = (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;
    // One transaction touching text, criteria and role facts is one version.
    await db.exec(`begin;
      update company_internal_roles set request = 'brief three' where role_id = '${role}';
      update company_internal_roles set criteria = '[{"name":"x"}]' where role_id = '${role}';
      update company_roles set location_text = 'Busan' where role_id = '${role}';
      commit;`);
    // Saving the same values, or changing and reverting in one transaction, adds nothing.
    await db.exec(`update company_internal_roles set request = 'brief three' where role_id = '${role}';`);
    await db.exec(`begin;
      update company_internal_roles set request = 'temporary' where role_id = '${role}';
      update company_internal_roles set request = 'brief three' where role_id = '${role}';
      commit;`);
    await db.exec(`update company_roles set location_text = 'Daegu' where role_id = '${external}';`);
    const rows = await revisions(role);
    assert.deepEqual(rows.map(r => [r.revision, r.source]), [[1, "migration"], [2, "chat"], [3, null]]);
    assert.equal(rows[1].actor_user_id, actor);
    assert.equal(rows[2].snapshot.search.location, "Busan");
    assert.equal(rows[2].legacy_brief_version, await version(role));
    assert.deepEqual(await revisions(external), []);

    // The structured Brief of a new role is versioned too.
    await db.exec(`update company_role_start_sessions set brief = '{"summary":"second"}' where role_id = '${newRole}';`);
    assert.deepEqual((await revisions(newRole)).map(r => r.revision), [1, 2]);

    // Point-in-time reads.
    const asOf = async (at: string) =>
      (await db.query<any>("select company_role_state_as_of_v1($1, $2) s", [role, at])).rows[0].s;
    assert.equal((await asOf(afterMigration)).brief.revision, 1);
    assert.equal((await asOf(afterSecond)).brief.snapshot.search.request, "brief two");
    assert.equal((await asOf("2000-01-01T00:00:00Z")).brief, null);

    // A decision keeps the Brief version number of its moment.
    await db.query("select pass_company_intro_v2($1, $2, $3, 'web', null, null)", [card, workspace, actor]);
    const decision = (await db.query<any>("select brief_revision from company_decision_events")).rows[0];
    assert.equal(decision.brief_revision, 3);
    const now = (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;
    assert.equal((await asOf(now)).decisions.length, 1);
    // A decision copied in later with an earlier time gets the version of that time.
    await db.exec(`insert into company_decision_events(company_workspace_id, role_id, subject_kind, subject_id, action,
      channel, idempotency_key, created_at) values ('${workspace}', '${role}', 'member_candidate', '${card}', 'pass',
      'unknown', 'old', '2000-01-01T00:00:00Z');`);
    assert.equal((await db.query<any>("select brief_revision from company_decision_events where idempotency_key = 'old'")).rows[0].brief_revision, null);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can("has_table_privilege('service_role', 'company_role_brief_revisions', 'SELECT')"), true);
    for (const privilege of ["INSERT", "UPDATE", "DELETE"])
      assert.equal(await can(`has_table_privilege('service_role', 'company_role_brief_revisions', '${privilege}')`), false);
    assert.equal(await can("has_table_privilege('anon', 'company_role_brief_revisions', 'SELECT')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'company_role_state_as_of_v1(uuid,timestamptz)', 'EXECUTE')"), true);
    assert.equal(await can("has_function_privilege('authenticated', 'company_role_state_as_of_v1(uuid,timestamptz)', 'EXECUTE')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'capture_company_role_brief_revision_v1(uuid)', 'EXECUTE')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_role_brief_revisions')"), true);
  } finally { await db.close(); }
});
