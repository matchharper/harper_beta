import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// A deleted candidate account keeps its talent_users row (deleted_at is set),
// so what companies were shown and their notes are removed by trigger. Only
// the objects the migrations read are created; company_presentations is cut
// down to the columns this migration uses.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid references company_workspace);
  create table talent_users(user_id uuid primary key, deleted_at timestamptz);
  create table talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, user_id text, company_user_id uuid, kind text, text text, metadata jsonb,
    created_at timestamptz default now());
  create table company_presentations(id uuid primary key default gen_random_uuid(), role_id uuid,
    talent_id uuid references talent_users(user_id) on delete cascade, shown jsonb not null default '{}');
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const author = "10000000-0000-4000-8000-000000000005";
const leaving = "20000000-0000-4000-8000-000000000001";
const staying = "20000000-0000-4000-8000-000000000002";
const leftEarlier = "20000000-0000-4000-8000-000000000003";

test("a deleted candidate's presentations, notes and note history go with the account", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    const migration = async (name: string) =>
      db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await migration("20261105140000_company_candidate_notes.sql");
    await db.exec(`
      insert into company_workspace values ('${workspace}');
      insert into company_roles values ('${role}', '${workspace}');
      insert into talent_users(user_id) values ('${leaving}'), ('${staying}'), ('${leftEarlier}');
    `);
    for (const talent of [leaving, staying, leftEarlier]) {
      await db.query(`insert into company_presentations(role_id, talent_id, shown) values ($1, $2, '{"summary":"x"}')`,
        [role, talent]);
      const note = (await db.query<any>(`insert into company_candidate_notes(company_workspace_id, role_id, talent_id,
        company_user_id, text) values ($1, $2, $3, $4, 'strong Go') returning id`, [workspace, role, talent, author])).rows[0].id;
      await db.query("update company_candidate_notes set text = 'strong Go, ask about pay' where id = $1", [note]);
    }
    const left = async (talent: string) => (await db.query<any>(`select
      (select count(*)::int from company_presentations where talent_id = $1) presentations,
      (select count(*)::int from company_candidate_notes where talent_id = $1) notes,
      (select count(*)::int from company_candidate_note_revisions where talent_id = $1) revisions`, [talent])).rows[0];

    // An account deleted before the migration is cleaned up once.
    await db.exec(`update talent_users set deleted_at = now() where user_id = '${leftEarlier}';`);
    assert.deepEqual(await left(leftEarlier), { presentations: 1, notes: 1, revisions: 2 });
    await migration("20261106100100_deleted_talent_company_records.sql");
    assert.deepEqual(await left(leftEarlier), { presentations: 0, notes: 0, revisions: 0 });

    // Marking an account deleted removes its records; other candidates keep theirs.
    await db.exec(`update talent_users set deleted_at = now() where user_id = '${leaving}';`);
    assert.deepEqual(await left(leaving), { presentations: 0, notes: 0, revisions: 0 });
    assert.deepEqual(await left(staying), { presentations: 1, notes: 1, revisions: 2 });

    // Updating a live account's other columns, or marking it again, changes nothing else.
    await db.exec(`update talent_users set deleted_at = deleted_at where user_id = '${leaving}';
      update talent_users set deleted_at = null where user_id = '${staying}';`);
    assert.deepEqual(await left(staying), { presentations: 1, notes: 1, revisions: 2 });

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can(
      "has_function_privilege('service_role', 'delete_company_records_of_deleted_talent_v1()', 'EXECUTE')"), false);
  } finally { await db.close(); }
});
