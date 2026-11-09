import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const author = "10000000-0000-4000-8000-000000000005";
const talent = "20000000-0000-4000-8000-000000000001";

test("each version of a note records the Brief, memory and company information of its moment", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_workspace(company_workspace_id uuid primary key);
      create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace);
      create table talent_users(user_id uuid primary key, deleted_at timestamptz);
      create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
        recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
        created_at timestamptz default now());
      create table company_role_brief_revisions(role_id uuid, revision int, created_at timestamptz default now());
      create table company_memory_revisions(id bigint generated always as identity primary key, company_workspace_id uuid, created_at timestamptz default now());
      create table company_info_revisions(company_workspace_id uuid, revision int, created_at timestamptz default now());
      insert into company_workspace values ('${workspace}');
      insert into company_roles values ('${role}', '${workspace}');
      insert into talent_users(user_id) values ('${talent}');
      insert into company_role_brief_revisions(role_id, revision) values ('${role}', 3);
      insert into company_memory_revisions(company_workspace_id) values ('${workspace}');
      insert into company_info_revisions(company_workspace_id, revision) values ('${workspace}', 2);
    `);
    for (const name of ["20261105140000_company_candidate_notes.sql", "20261109040000_company_note_versions.sql"])
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));

    const id = (await db.query<any>(`insert into company_candidate_notes(company_workspace_id, role_id, talent_id,
      company_user_id, text) values ($1, $2, $3, $4, 'first') returning id`, [workspace, role, talent, author])).rows[0].id;
    await db.exec(`insert into company_role_brief_revisions(role_id, revision) values ('${role}', 4);
      insert into company_info_revisions(company_workspace_id, revision) values ('${workspace}', 3);`);
    await db.query("update company_candidate_notes set text = 'second' where id = $1", [id]);

    const rows = (await db.query<any>(`select text, brief_revision, memory_version::int, company_info_revision
      from company_candidate_note_revisions where note_id = $1 order by revision`, [id])).rows;
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { text: "first", brief_revision: 3, memory_version: 1, company_info_revision: 2 },
      { text: "second", brief_revision: 4, memory_version: 1, company_info_revision: 3 },
    ]);
  } finally { await db.close(); }
});
