import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Old single-text memories are copied into company memory in the same
// transaction, read-only, without changing the memory fingerprint.
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
  create table company_memories(id uuid primary key default gen_random_uuid(), company_workspace_id uuid, role_id uuid,
    content text, created_at timestamptz default now(), updated_at timestamptz default now());
  create function scheduled_company_memory_fingerprint_v1(p_role uuid)
  returns text language sql stable security invoker set search_path=public,pg_temp as $$
  select md5(jsonb_build_object(
    'entries',(select jsonb_agg(to_jsonb(m) order by m.id) from public.company_memory_entries m
      where m.company_workspace_id=r.company_workspace_id and m.deleted_at is null
        and (m.scope='company' or (m.scope='role' and m.role_id=r.role_id) or (m.scope='team' and m.team_id=i.team_id))),
    'legacy',(select jsonb_agg(to_jsonb(m) order by m.id) from public.company_memories m
      where m.company_workspace_id=r.company_workspace_id and (m.role_id is null or m.role_id=r.role_id)),
    'legacyRole',i.memory)::text)
  from public.company_roles r join public.company_internal_roles i using(role_id) where r.role_id=p_role
  $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000009";

test("old memory texts are copied into company memory, read-only, fingerprint unchanged", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}', 'Company');
      insert into company_roles(role_id, company_workspace_id, name, source_type) values ('${role}', '${workspace}', 'Engineer', 'internal');
      insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief', '[]');
      insert into company_memories(company_workspace_id, role_id, content, created_at, updated_at)
        values ('${workspace}', '${role}', 'prefers startups', '2026-08-10T08:22:58Z', '2026-08-10T08:22:58Z');
      -- Another company with a newer entry saved before versions and an older old memory.
      insert into company_workspace values ('${other}', 'Other');
      insert into company_memory_entries(company_workspace_id, scope, content, updated_at)
        values ('${other}', 'company', 'newer entry', '2026-10-01T00:00:00Z');
      insert into company_memories(company_workspace_id, content, created_at, updated_at)
        values ('${other}', 'older text', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    `);
    const load = async (name: string) =>
      db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await load("20261105020000_company_decision_events.sql");
    await load("20261105080000_company_role_brief_revisions.sql");
    await load("20261105090000_company_role_setting_revisions.sql");
    await load("20261105130000_company_memory_revisions.sql");
    const fingerprint = async () => (await db.query<any>("select scheduled_company_memory_fingerprint_v1($1) f", [role])).rows[0].f;
    const before = await fingerprint();
    await load("20261105170000_company_memory_legacy_copies.sql");

    const memory = async () => (await db.query<any>(
      "select scope, content, kind, source from company_memory_for_role_v1($1)", [role])).rows
      .map((r: any) => [r.scope, r.content, r.kind, r.source]);
    // The existing text is copied; the fingerprint does not change.
    assert.deepEqual(await memory(), [["role", "prefers startups", "legacy", "company_memories"]]);
    assert.equal(await fingerprint(), before);
    // The copy keeps the time the old memory was saved, so earlier point-in-time
    // reads see it; never before the company's other versions, so numbers stay in time order.
    const changedAt = async (w: string) => (await db.query<any>(
      "select content, changed_at from company_memory_for_workspace_v1($1)", [w])).rows
      .map((r: any) => [r.content, new Date(r.changed_at).toISOString()]);
    assert.deepEqual(await changedAt(workspace), [["prefers startups", "2026-08-10T08:22:58.000Z"]]);
    assert.deepEqual(await changedAt(other), [
      ["newer entry", "2026-10-01T00:00:00.000Z"], ["older text", "2026-10-01T00:00:00.000Z"]]);
    const at = (await db.query<any>("select company_role_state_as_of_v1($1, '2026-09-01T00:00:00Z') s", [role])).rows[0].s;
    assert.deepEqual(at.memory.entries.map((e: any) => e.content), ["prefers startups"]);

    // Writes to the old places follow: edit, a role memory, clearing, deleting.
    await db.exec(`update company_memories set content = 'prefers seed startups';
      update company_internal_roles set memory = 'needs Korean' where role_id = '${role}';`);
    assert.deepEqual(await memory(), [
      ["role", "prefers seed startups", "legacy", "company_memories"],
      ["role", "needs Korean", "legacy", "company_internal_roles.memory"],
    ]);
    await db.exec(`update company_internal_roles set memory = '' where role_id = '${role}';
      delete from company_memories;`);
    assert.deepEqual(await memory(), []);
    assert.ok((await db.query<any>("select count(*)::int n from company_memory_revisions")).rows[0].n >= 5);

    // The copies cannot be changed or made outside the copy triggers.
    await assert.rejects(db.exec(`update company_memory_entries set content = 'x' where legacy_ref is not null;`),
      /company_memory_legacy_copy_read_only/);
    await assert.rejects(db.exec(`insert into company_memory_entries(company_workspace_id, scope, content, legacy_ref)
      values ('${workspace}', 'company', 'x', 'fake');`), /company_memory_legacy_copy_read_only/);
    // Ordinary memory still works and still counts in the fingerprint.
    await db.exec(`insert into company_memory_entries(company_workspace_id, scope, content) values ('${workspace}', 'company', 'remote');`);
    assert.notEqual(await fingerprint(), before);
  } finally { await db.close(); }
});
