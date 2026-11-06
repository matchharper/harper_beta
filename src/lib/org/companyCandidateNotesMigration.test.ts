import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Company notes live in a company-side table with history (D20); a trigger
// keeps the talent_progress copy that readers still use. Only the objects the
// migration reads are created.
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
const oldNote = "30000000-0000-4000-8000-000000000001";
const passCopy = "30000000-0000-4000-8000-000000000002";

test("notes move to a company-side table with history, and the progress copy follows them", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}');
      insert into company_roles values ('${role}', '${workspace}');
      insert into talent_users values ('${talent}');
      insert into talent_progress(id, talent_id, role_id, company_user_id, user_id, kind, text, metadata, created_at) values
        ('${oldNote}', '${talent}', '${role}', '${author}', 'a@x.com', 'org_note', 'strong Go', '{"org":true}', '2026-10-01T00:00:00Z'),
        ('${passCopy}', '${talent}', '${role}', '${author}', 'a@x.com', 'org_note', 'not now', '{"decision":"pass"}', '2026-10-02');
    `);
    await db.exec(await readFile(new URL(
      "../../../supabase/migrations/20261105140000_company_candidate_notes.sql", import.meta.url), "utf8"));

    const notes = async () => (await db.query<any>(`select id, text, revision, deleted_at is not null deleted
      from company_candidate_notes order by created_at`)).rows.map(r => [r.id, r.text, r.revision, r.deleted]);
    const copies = async () => (await db.query<any>(`select id, text from talent_progress
      where kind = 'org_note' order by created_at`)).rows.map(r => [r.id, r.text]);
    const history = async (id: string) => (await db.query<any>(`select text, revision, deleted_at is not null deleted,
      created_at from company_candidate_note_revisions where note_id = $1 order by id`, [id])).rows;

    // The note moves with its id and original time; the Pass reason copy stays where it is.
    assert.deepEqual(await notes(), [[oldNote, "strong Go", 1, false]]);
    assert.deepEqual(await copies(), [[oldNote, "strong Go"], [passCopy, "not now"]]);
    assert.equal(new Date((await history(oldNote))[0].created_at).toISOString(), "2026-10-01T00:00:00.000Z");

    // A new note writes its copy; an edit bumps the revision and the copy; an
    // unchanged save adds nothing.
    const added = (await db.query<any>(`insert into company_candidate_notes(company_workspace_id, role_id, talent_id,
      company_user_id, author_email, text) values ($1, $2, $3, $4, 'a@x.com', 'ask about pay') returning id`,
      [workspace, role, talent, author])).rows[0].id;
    const copy = (await db.query<any>("select kind, text, user_id, company_user_id, metadata from talent_progress where id = $1", [added])).rows[0];
    assert.deepEqual([copy.kind, copy.text, copy.user_id, copy.company_user_id, copy.metadata.noteId], ["org_note", "ask about pay", "a@x.com", author, added]);
    await db.exec(`update company_candidate_notes set text = 'ask about pay range' where id = '${added}';
      update company_candidate_notes set text = 'ask about pay range' where id = '${added}';`);
    assert.equal((await db.query<any>("select text from talent_progress where id = $1", [added])).rows[0].text, "ask about pay range");
    assert.deepEqual((await history(added)).map(r => [r.text, r.revision, r.deleted]),
      [["ask about pay", 1, false], ["ask about pay range", 2, false]]);

    // Deleting keeps the history and removes the copy; a deleted note cannot be edited.
    await db.exec(`update company_candidate_notes set deleted_at = now() where id = '${added}';`);
    assert.deepEqual(await copies(), [[oldNote, "strong Go"], [passCopy, "not now"]]);
    assert.deepEqual((await history(added)).map(r => [r.text, r.revision, r.deleted]),
      [["ask about pay", 1, false], ["ask about pay range", 2, false], ["ask about pay range", 2, true]]);
    await assert.rejects(db.exec(`update company_candidate_notes set text = 'again' where id = '${added}';`),
      /company_candidate_note_deleted/);

    // The candidate account takes the notes and their history along.
    await db.exec(`delete from talent_progress where talent_id = '${talent}'; delete from talent_users where user_id = '${talent}';`);
    assert.deepEqual(await notes(), []);
    assert.equal((await db.query<any>("select count(*)::int n from company_candidate_note_revisions")).rows[0].n, 0);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    for (const privilege of ["SELECT", "INSERT", "UPDATE"])
      assert.equal(await can(`has_table_privilege('service_role', 'company_candidate_notes', '${privilege}')`), true);
    assert.equal(await can("has_table_privilege('service_role', 'company_candidate_notes', 'DELETE')"), false);
    assert.equal(await can("has_table_privilege('service_role', 'company_candidate_note_revisions', 'INSERT')"), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_candidate_notes', 'SELECT')"), false);
    for (const table of ["company_candidate_notes", "company_candidate_note_revisions"])
      assert.equal(await can(`(select relrowsecurity from pg_class where relname = '${table}')`), true);
  } finally { await db.close(); }
});
