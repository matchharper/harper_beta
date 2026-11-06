import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Version numbers point at what was in force (#255, #258, worker #61): memory
// versions are in time order, so "as of T" reads take a prefix; a search Brief
// hash maps to one Brief version by hash plus time.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key, company_name text);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace, name text,
    description text, location_text text, country_code text, work_mode text, type text, seniority_level text,
    salary_range text, salary_min int, salary_max int, salary_currency text, salary_period text, source_type text,
    updated_at timestamptz, status text default 'active', priority smallint);
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb,
    team_id uuid, memory text, updated_at timestamptz, created_at timestamptz default now(), role_status_changed_at timestamptz);
  create table company_role_start_sessions(role_id uuid primary key references company_roles, brief jsonb);
  create table company_intro_candidates(id uuid primary key, company_workspace_id uuid, role_id uuid, talent_id uuid,
    status text, close_reason text, requested_by_company_user_id uuid, requested_at timestamptz, company_appeal text,
    next_stage_id uuid, revision int not null default 0, updated_at timestamptz);
  create table company_messages(id bigint generated always as identity primary key, company_workspace_id uuid, body text);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now(), open_to_talent boolean, open_to_company boolean);
  create function company_role_search_brief_snapshot_v1(p_role_id uuid) returns jsonb language sql stable set search_path = public as $$
    select jsonb_build_object('roleId', r.role_id, 'request', ir.request, 'criteria', ir.criteria)
    from company_roles r join company_internal_roles ir using(role_id) where r.role_id = p_role_id $$;
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable set search_path = public as $$
    select md5(company_role_search_brief_snapshot_v1(p_role_id)::text) $$;
  create function scheduled_company_memory_fingerprint_v1(p_role uuid) returns text language sql stable set search_path = public as $$
    select ''::text $$;
  create function pass_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_passed') $$;
  create function request_company_intro_v1(p_intro_candidate_id uuid, p_company_workspace_id uuid, p_company_user_id uuid,
    p_next_stage_id uuid, p_intro_recipient_emails text[], p_company_appeal text)
  returns jsonb language sql as $$ select jsonb_build_object('status', 'already_requested') $$;
  create table company_memory_entries(id bigint generated always as identity primary key, company_workspace_id uuid not null,
    scope text not null, team_id uuid, role_id uuid, label text not null default '', content text not null,
    revision bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    deleted_at timestamptz);
  create table company_role_candidate_evaluations(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, talent_id uuid, stage int, brief_version text, evaluated_at timestamptz not null default now());
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000009";
const role = "10000000-0000-4000-8000-000000000002";
const talent = "20000000-0000-4000-8000-000000000001";

const migration = (name: string) => readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

async function setUp() {
  const db = new PGlite();
  await db.exec(SETUP);
  await db.exec(`
    insert into company_workspace values ('${workspace}', 'Company'), ('${other}', 'Other');
    insert into company_roles(role_id, company_workspace_id, name, source_type) values ('${role}', '${workspace}', 'Engineer', 'internal');
    insert into company_internal_roles(role_id, request, criteria) values ('${role}', 'brief A', '[]');
  `);
  for (const name of [
    "20261105020000_company_decision_events.sql",
    "20261105080000_company_role_brief_revisions.sql",
    "20261105090100_company_role_setting_revisions.sql",
    "20261105130100_company_memory_revisions.sql",
  ]) await db.exec(await migration(name));
  return db;
}

test("memory versions are in time order, so an as-of read never includes a later change", async () => {
  const db = await setUp();
  try {
    const memory = (content: string, company = workspace) => db.exec(
      `insert into company_memory_entries(company_workspace_id, scope, content) values ('${company}', 'company', '${content}')`);
    const revisions = async (company = workspace) => (await db.query<any>(
      "select id, created_at from company_memory_revisions where company_workspace_id = $1 order by id", [company])).rows;
    await memory("first");
    await memory("second");
    await memory("elsewhere", other);
    // Two overlapping writes committed out of start order: the later id got the earlier time.
    const [first, second] = await revisions();
    await db.query("update company_memory_revisions set created_at = $2::timestamptz - interval '1 second' where id = $1",
      [second.id, first.created_at]);

    await db.exec(await migration("20261107060100_company_version_reads.sql"));
    // Saved rows are put back in order: each time at least the one before it in its company.
    const repaired = await revisions();
    assert.equal(repaired[1].created_at.getTime(), repaired[0].created_at.getTime());
    assert.equal((await revisions(other)).length, 1);

    // A write whose transaction started before the last committed version gets that version's time.
    const later = new Date(Date.now() + 60 * 60_000);
    await db.query("update company_memory_revisions set created_at = $1 where id = $2", [later, repaired[1].id]);
    await memory("third");
    const third = (await revisions()).at(-1);
    assert.ok(third.created_at.getTime() >= later.getTime());

    // As of a moment before both: the version and entries are those before them.
    const asOf = async (at: Date) => (await db.query<any>("select company_role_state_as_of_v1($1, $2) s", [role, at])).rows[0].s.memory;
    const before = await asOf(new Date(later.getTime() - 1_000));
    assert.equal(Number(before.version), repaired[0].id);
    assert.deepEqual(before.entries.map((entry: any) => entry.content), ["first"]);
    const after = await asOf(new Date(later.getTime() + 1_000));
    assert.deepEqual(after.entries.map((entry: any) => entry.content), ["first", "second", "third"]);
    // A decision made then records the same version.
    await db.exec(`insert into company_decision_events(company_workspace_id, role_id, subject_kind, subject_id, action, channel,
      idempotency_key, created_at) values ('${workspace}', '${role}', 'member_candidate', gen_random_uuid(), 'pass', 'web', 'd1',
      '${new Date(later.getTime() - 1_000).toISOString()}')`);
    assert.equal(Number((await db.query<any>("select memory_version from company_decision_events where idempotency_key = 'd1'")).rows[0].memory_version),
      repaired[0].id);

    // Applying the file again changes nothing.
    const kept = await revisions();
    await db.exec(await migration("20261107060100_company_version_reads.sql"));
    assert.deepEqual(await revisions(), kept);
  } finally { await db.close(); }
});

test("a search Brief hash maps to one Brief version by hash plus time", async () => {
  const db = await setUp();
  try {
    await db.exec(await migration("20261107060100_company_version_reads.sql"));
    // Version 1 is brief A (the migration); then B, then A again.
    await db.exec(`update company_internal_roles set request = 'brief B' where role_id = '${role}'`);
    await db.exec(`update company_internal_roles set request = 'brief A' where role_id = '${role}'`);
    const versions = (await db.query<any>(
      "select revision, legacy_brief_version as hash, created_at from company_role_brief_revisions where role_id = $1 order by revision",
      [role])).rows;
    assert.equal(versions.length, 3);
    const [a1, b, a2] = versions;
    assert.equal(a1.hash, a2.hash);

    const pick = async (hash: string, at: Date) =>
      (await db.query<any>("select company_role_brief_revision_for_version_v1($1, $2, $3) v", [role, hash, at])).rows[0].v;
    const justBefore = (at: Date) => new Date(at.getTime() - 1);
    assert.equal(await pick(a1.hash, justBefore(b.created_at)), 1);
    assert.equal(await pick(b.hash, b.created_at), 2);
    assert.equal(await pick(a1.hash, a2.created_at), 3);
    // Older than the first version: the first version with that hash.
    assert.equal(await pick(a1.hash, new Date("2000-01-01T00:00:00Z")), 1);
    assert.equal(await pick("unknown", a2.created_at), null);

    // New evaluations record it; a writer's own number is kept.
    const evaluate = async (hash: string, at: Date, revision: number | null = null) => (await db.query<any>(
      `insert into company_role_candidate_evaluations(company_workspace_id, role_id, talent_id, stage, brief_version, evaluated_at, brief_revision)
       values ($1, $2, $3, 1, $4, $5, $6) returning brief_revision`, [workspace, role, talent, hash, at, revision])).rows[0].brief_revision;
    assert.equal(await evaluate(a1.hash, justBefore(b.created_at)), 1);
    assert.equal(await evaluate(a1.hash, a2.created_at), 3);
    assert.equal(await evaluate(b.hash, a2.created_at), 2);
    assert.equal(await evaluate(a1.hash, a2.created_at, 7), 7);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const signature = "company_role_brief_revision_for_version_v1(uuid,text,timestamptz)";
    assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
    assert.equal(await can(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), false);
  } finally { await db.close(); }
});
