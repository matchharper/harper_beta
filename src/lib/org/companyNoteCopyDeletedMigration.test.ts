import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// A note whose timeline copy was deleted from Ops (before the app deleted
// notes there) can be closed with its history. The migration only creates the
// function; it changes no note by itself. Only the objects the migrations read
// are created.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace);
  create table talent_users(user_id uuid primary key);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now());
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const author = "10000000-0000-4000-8000-000000000005";
const talent = "20000000-0000-4000-8000-000000000001";

test("a live note whose copy was deleted from Ops can be closed, keeping its history", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}');
      insert into company_roles values ('${role}', '${workspace}');
      insert into talent_users values ('${talent}');
    `);
    await db.exec(await readFile(new URL(
      "../../../supabase/migrations/20261105140000_company_candidate_notes.sql", import.meta.url), "utf8"));
    const add = async (text: string) => (await db.query<any>(`insert into company_candidate_notes(company_workspace_id, role_id,
      talent_id, company_user_id, author_email, text) values ($1, $2, $3, $4, 'a@x.com', $5) returning id`,
      [workspace, role, talent, author, text])).rows[0].id as string;
    const kept = await add("kept");
    const orphan = await add("copy deleted from Ops");
    const deleted = await add("deleted by the author");
    await db.exec(`update company_candidate_notes set deleted_at = now() - interval '1 day' where id = '${deleted}';
      delete from talent_progress where id = '${orphan}';`);
    const state = async () => (await db.query<any>(`select note.text, note.deleted_at is not null deleted,
      (select count(*)::int from company_candidate_note_revisions revision where revision.note_id = note.id) revisions
      from company_candidate_notes note order by note.created_at, note.text`)).rows.map((row) => [row.text, row.deleted, row.revisions]);
    const before = await state();

    await db.exec(await readFile(new URL(
      "../../../supabase/migrations/20261107050200_company_note_copy_deleted_elsewhere.sql", import.meta.url), "utf8"));
    assert.deepEqual(await state(), before, "the migration changes no note");

    assert.equal((await db.query<any>("select close_company_notes_without_copy_v1() n")).rows[0].n, 1);
    const after = Object.fromEntries((await state()).map(([text, ...rest]) => [text, rest]));
    assert.deepEqual(after, {
      "kept": [false, 1],
      "copy deleted from Ops": [true, 2],
      "deleted by the author": [true, 2],
    });
    const [last] = (await db.query<any>(`select text, deleted_at is not null deleted from company_candidate_note_revisions
      where note_id = $1 order by id desc limit 1`, [orphan])).rows;
    assert.deepEqual(last, { text: "copy deleted from Ops", deleted: true });
    assert.equal((await db.query<any>(`select count(*)::int n from talent_progress where id = '${kept}'`)).rows[0].n, 1);
    // Running it again changes nothing.
    assert.equal((await db.query<any>("select close_company_notes_without_copy_v1() n")).rows[0].n, 0);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    for (const user of ["service_role", "anon", "authenticated"])
      assert.equal(await can(`has_function_privilege('${user}', 'close_company_notes_without_copy_v1()', 'EXECUTE')`), false);
  } finally { await db.close(); }
});
