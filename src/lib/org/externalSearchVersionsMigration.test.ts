import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// External searches record the Brief and memory versions of each start.
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
  create table external_sourcing_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, status text not null default 'queued', attempt_count int default 0);
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";

test("an external run takes the Brief and memory versions when it starts, again on a retry", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values ('${role}', '${workspace}', 'Engineer', 'internal');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief one', '[]');
    `);
    for (const name of [
      "20261105020000_company_decision_events.sql",
      "20261105080000_company_role_brief_revisions.sql",
      "20261105090000_company_role_setting_revisions.sql",
      "20261105130000_company_memory_revisions.sql",
      "20261105160000_external_search_versions.sql",
    ]) await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const run = (await db.query<any>(`insert into external_sourcing_runs(company_workspace_id, role_id)
      values ($1, $2) returning id`, [workspace, role])).rows[0].id;
    const versions = async () => {
      const row = (await db.query<any>("select brief_revision, memory_version from external_sourcing_runs where id = $1", [run])).rows[0];
      return [row.brief_revision, row.memory_version === null ? null : Number(row.memory_version)];
    };
    assert.deepEqual(await versions(), [null, null]);

    await db.exec(`update external_sourcing_runs set status = 'running' where id = '${run}';`);
    assert.deepEqual(await versions(), [1, 0]);

    // Other writes while running keep the versions of the start.
    await db.exec(`update company_internal_roles set request = 'brief two' where role_id = '${role}';
      insert into company_memory_entries(company_workspace_id, scope, content) values ('${workspace}', 'company', 'remote first');
      update external_sourcing_runs set attempt_count = 1 where id = '${run}';
      update external_sourcing_runs set status = 'running' where id = '${run}';`);
    assert.deepEqual(await versions(), [1, 0]);

    // A recovered run that starts again takes the versions of the new start.
    await db.exec(`update external_sourcing_runs set status = 'queued' where id = '${run}';
      update external_sourcing_runs set status = 'running' where id = '${run}';`);
    const [brief, memory] = await versions();
    assert.equal(brief, 2);
    assert.ok((memory as number) > 0);
  } finally { await db.close(); }
});
