import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Posting facts follow the Role (E3b, D18 B); posting text keeps versions and
// is flagged for review when the Role's Brief changes (D19).
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_roles(role_id uuid primary key, name text, location_text text, country_code text,
    type text[], salary_range text, seniority_level text, updated_at timestamptz default now());
  create table company_internal_roles(role_id uuid primary key references company_roles, request text, criteria jsonb);
  create table official_jobs(id uuid primary key default gen_random_uuid(), company_name text not null,
    role_title text not null, location text not null, vertical text not null default '',
    short_description text not null default '', company_description_markdown text not null default '',
    role_description_markdown text not null default '', compensation text, employment_type text, seniority text,
    slug text not null, is_published boolean not null default false,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now(), role_id uuid);
  create function set_official_jobs_updated_at() returns trigger language plpgsql as $$
    begin new.updated_at = timezone('utc', now()); return new; end $$;
  create trigger official_jobs_set_updated_at before update on official_jobs
    for each row execute function set_official_jobs_updated_at();
  create function company_role_search_brief_version_v1(p_role_id uuid) returns text language sql stable
  set search_path = public, pg_temp as $$
    select md5(coalesce(r.location_text, '') || coalesce(r.country_code, '') || coalesce(ir.request, ''))
    from company_roles r join company_internal_roles ir using (role_id) where r.role_id = p_role_id $$;
`;

const seoul = "20000000-0000-4000-8000-000000000001";
const bare = "20000000-0000-4000-8000-000000000002";
const old = "2026-10-01T00:00:00.000Z";

test("posting facts follow the Role; text versions flag a Brief change for review", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_roles values
        ('${seoul}', 'Engineer', 'Seoul, South Korea', 'KR', '{full_time}', '협의', null),
        ('${bare}', 'Intern', null, null, '{}', null, null);
      insert into company_internal_roles values ('${seoul}', 'Find engineers', '{}'), ('${bare}', 'Find interns', '{}');
      insert into official_jobs(id, company_name, role_title, location, compensation, employment_type, seniority, slug, role_id, updated_at)
      values ('30000000-0000-4000-8000-000000000001', 'Alias Inc', 'Engineer', '🇰🇷 Seoul', null, 'Full-time', 'Senior', 'a', '${seoul}', '${old}'),
             ('30000000-0000-4000-8000-000000000002', 'Alias Inc', 'Intern', '🇰🇷 Seoul', 'Paid', 'Part-time', 'Junior', 'b', '${bare}', '${old}'),
             ('30000000-0000-4000-8000-000000000003', 'Other', 'Loose', 'Remote', null, 'Full-time', null, 'c', null, '${old}');
    `);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261105220000_official_job_role_facts.sql", import.meta.url), "utf8"));

    const job = async (slug: string) =>
      (await db.query<any>("select * from official_jobs where slug = $1", [slug])).rows[0];
    const state = async (slug: string) =>
      (await db.query<any>("select s.* from official_jobs_ops_state_v1() s join official_jobs j on j.id = s.job_id where j.slug = $1", [slug])).rows[0];

    // At the switch: Role values where the Role has one, posting values otherwise; updated_at kept.
    let a = await job("a");
    assert.deepEqual([a.location, a.compensation, a.employment_type, a.seniority],
      ["🇰🇷 Seoul, South Korea", "협의", "Full-time", "Senior"]);
    assert.equal(new Date(a.updated_at).toISOString(), old);
    const b = await job("b");
    assert.deepEqual([b.location, b.compensation, b.employment_type, b.seniority], ["🇰🇷 Seoul", "Paid", "Part-time", "Junior"]);
    assert.equal((await job("c")).location, "Remote");
    assert.deepEqual(
      [(await state("a")).role_location, (await state("a")).role_seniority, (await state("a")).needs_review],
      [true, false, false]);
    assert.equal((await db.query<any>("select count(*)::int n from official_job_revisions where kind = 'backfill'")).rows[0].n, 3);

    // A posting write cannot override a Role fact; it can fill what the Role leaves empty.
    await db.query("update official_jobs set location = 'Busan', seniority = 'Staff', role_title = 'Engineer II' where slug = 'a'");
    a = await job("a");
    assert.deepEqual([a.location, a.seniority, a.role_title], ["🇰🇷 Seoul, South Korea", "Staff", "Engineer II"]);
    assert.notEqual(new Date(a.updated_at).toISOString(), old);
    const editedAt = new Date(a.updated_at).toISOString();

    // A Role fact change reaches the posting without moving updated_at; the posting now needs review.
    await db.query(`update company_roles set location_text = 'Bangkok', country_code = 'th', type = '{internship}', seniority_level = 'Lead' where role_id = '${seoul}'`);
    a = await job("a");
    assert.deepEqual([a.location, a.employment_type, a.seniority], ["🇹🇭 Bangkok", "Internship", "Lead"]);
    assert.equal(new Date(a.updated_at).toISOString(), editedAt);
    const kinds = (await db.query<any>("select kind from official_job_revisions where job_id = $1 order by revision", [a.id])).rows.map((row) => row.kind);
    assert.deepEqual(kinds, ["backfill", "edit", "role_facts"]);
    assert.equal((await state("a")).needs_review, true);

    // Marking reviewed clears it; a Brief text change raises it again; an edit clears it.
    await db.query("select mark_official_job_reviewed_v1($1)", [a.id]);
    assert.equal((await state("a")).needs_review, false);
    await db.query(`update company_internal_roles set request = 'Find senior engineers' where role_id = '${seoul}'`);
    assert.equal((await state("a")).needs_review, true);
    await db.query("update official_jobs set short_description = 'New summary' where slug = 'a'");
    assert.equal((await state("a")).needs_review, false);

    // A flag already in the Role text is not doubled; no country code, no flag.
    await db.query(`update company_roles set location_text = '🇹🇭 Bangkok' where role_id = '${seoul}'`);
    assert.equal((await job("a")).location, "🇹🇭 Bangkok");
    await db.query(`update company_roles set location_text = 'APAC', country_code = null where role_id = '${seoul}'`);
    assert.equal((await job("a")).location, "APAC");

    // The posting as it was at a moment.
    const first = (await db.query<any>("select official_job_as_of_v1($1, $2::timestamptz) v", [a.id, "2026-10-02T00:00:00Z"])).rows[0].v;
    assert.deepEqual([first.revision, first.role_title, first.location], [1, "Engineer", "🇰🇷 Seoul, South Korea"]);
  } finally {
    await db.close();
  }
});

// The candidate side's Role read takes location and compensation from the Role
// first, the posting only where the Role is empty; posting text still wins.
test("candidate Role read takes Role facts first", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_workspace(company_workspace_id uuid primary key, company_name text, published_name text,
        company_description text);
      create table company_roles(role_id uuid primary key, company_workspace_id uuid, name text, description text,
        location_text text, work_mode text, salary_range text);
      create table company_internal_roles(role_id uuid primary key, is_anonymous boolean);
      create table official_jobs(id uuid primary key default gen_random_uuid(), role_id uuid, is_published boolean,
        updated_at timestamptz default now(), role_title text, role_description_markdown text, company_name text,
        company_description_markdown text, location text, compensation text, slug text);
      create function public.career_internal_role_is_readable_v1(p_talent uuid, p_role uuid) returns boolean
        language sql as 'select true';
      insert into company_workspace values ('${seoul}', 'Real Inc', 'Public Inc', 'About');
      insert into company_roles values
        ('${seoul}', '${seoul}', 'Engineer', 'Role text', 'Seoul, South Korea', 'onsite', '협의'),
        ('${bare}', '${seoul}', 'Intern', 'Role text', '', 'remote', null);
      insert into company_internal_roles values ('${seoul}', false), ('${bare}', false);
      insert into official_jobs(role_id, is_published, role_title, role_description_markdown, company_name,
        company_description_markdown, location, compensation, slug)
      values ('${seoul}', true, 'Posting title', 'Posting text', 'Alias Inc', '', '🇰🇷 Seoul', 'Posting pay', 'a'),
             ('${bare}', true, 'Intern posting', '', 'Alias Inc', '', '🇰🇷 Seoul', 'Paid', 'b');
    `);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261105220100_career_internal_role_role_facts.sql", import.meta.url), "utf8"));
    const read = async (role: string) =>
      (await db.query<any>("select public.read_career_internal_role_v1($1::uuid, $2::uuid) v", [seoul, role])).rows[0].v;
    const withRole = await read(seoul);
    assert.deepEqual([withRole.location, withRole.compensation, withRole.name, withRole.companyName],
      ["Seoul, South Korea", "협의", "Posting title", "Alias Inc"]);
    const empty = await read(bare);
    assert.deepEqual([empty.location, empty.compensation], ["🇰🇷 Seoul", "Paid"]);
  } finally {
    await db.close();
  }
});
