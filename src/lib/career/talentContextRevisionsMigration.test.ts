import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Behavior and Career memo versions are kept as they change, and an evaluation
// records the Behavior version it was saved with. Only the objects the
// migration reads are created.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table talent_users(user_id uuid primary key);
  create table talent_behavior_contexts(talent_id uuid primary key references talent_users on delete cascade,
    context_text text, context_version bigint, context_hash text, builder_version text,
    last_changed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
  create table talent_contexts(id bigint generated always as identity primary key,
    talent_id uuid references talent_users on delete cascade, ref bigint, collection text, label text, key text,
    content text, revision bigint, embedding_model text, created_at timestamptz default now(),
    updated_at timestamptz default now(), deleted_at timestamptz);
  create table company_role_candidate_evaluations(id uuid primary key default gen_random_uuid(), role_id uuid,
    talent_id uuid, stage int, evaluated_at timestamptz default now());
`;

const talent = "20000000-0000-4000-8000-000000000001";
const blank = "20000000-0000-4000-8000-000000000002";

test("Behavior and Career memo versions are kept and evaluations pin the Behavior version", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into talent_users values ('${talent}'), ('${blank}');
      insert into talent_behavior_contexts(talent_id, context_text, context_version, context_hash, builder_version)
        values ('${talent}', 'behavior one', 1, 'h1', 'v4'), ('${blank}', '', 0, '', 'v4');
      insert into talent_contexts(talent_id, ref, collection, label, content, revision, deleted_at) values
        ('${talent}', 1, 'brief', 'Goal', 'backend lead', 1, null),
        ('${talent}', 2, 'memory', 'Old', 'gone', 3, now());
    `);
    await db.exec(await readFile(new URL(
      "../../../supabase/migrations/20261105120000_talent_context_revisions.sql", import.meta.url), "utf8"));

    const behavior = async () => (await db.query<any>(`select talent_id, context_version, context_text
      from talent_behavior_context_revisions order by talent_id, context_version`)).rows
      .map(r => [r.talent_id === talent ? "talent" : "blank", Number(r.context_version), r.context_text]);
    const memos = async () => (await db.query<any>(`select ref, content, revision, deleted_at is not null as deleted
      from talent_context_revisions order by id`)).rows.map(r => [Number(r.ref), r.content, Number(r.revision), r.deleted]);

    // First versions: the current non-blank Behavior and the live memos.
    assert.deepEqual(await behavior(), [["talent", 1, "behavior one"]]);
    assert.deepEqual(await memos(), [[1, "backend lead", 1, false]]);

    // An evaluation pins the Behavior version it was saved with; none without a Behavior.
    await db.exec(`insert into company_role_candidate_evaluations(talent_id, stage) values ('${talent}', 1), ('${blank}', 1);`);

    // A rebuild with the same text, a marked (blank) text, and a new version.
    await db.exec(`update talent_behavior_contexts set updated_at = now(), builder_version = 'v4' where talent_id = '${talent}';
      update talent_behavior_contexts set context_text = '', context_hash = '', builder_version = 'marker' where talent_id = '${talent}';
      update talent_behavior_contexts set context_text = 'behavior two', context_hash = 'h2', context_version = 2 where talent_id = '${talent}';`);
    await db.exec(`insert into company_role_candidate_evaluations(talent_id, stage) values ('${talent}', 2);`);
    assert.deepEqual(await behavior(), [["talent", 1, "behavior one"], ["talent", 2, "behavior two"]]);
    const pinned = (await db.query<any>(`select talent_id, stage, source_behavior_context_version v
      from company_role_candidate_evaluations order by stage, talent_id`)).rows
      .map(r => [r.talent_id === talent ? "talent" : "blank", r.stage, r.v === null ? null : Number(r.v)]);
    assert.deepEqual(pinned, [["talent", 1, 1], ["blank", 1, null], ["talent", 2, 2]]);

    const beforeEdits = (await db.query<any>("select clock_timestamp() as moment")).rows[0].moment;
    // Memo edits and deletion are versions (kept text); an embedding refresh is not.
    await db.exec(`update talent_contexts set embedding_model = 'e5', updated_at = now() where ref = 1;
      update talent_contexts set content = 'staff engineer', revision = 2 where ref = 1;
      update talent_contexts set deleted_at = now(), revision = 3 where ref = 1;
      insert into talent_contexts(talent_id, ref, collection, label, content, revision) values ('${talent}', 3, 'brief', 'Pay', 'open', 1);`);
    assert.deepEqual(await memos(), [
      [1, "backend lead", 1, false], [1, "staff engineer", 2, false], [1, "staff engineer", 3, true], [3, "open", 1, false],
    ]);

    // As of a moment, the memos are what an evaluation then saw: a memo deleted
    // later is still there, a deleted one is gone now.
    const asOf = async (at: string) => (await db.query<any>(
      "select ref, content from talent_contexts_as_of_v1($1, $2)", [talent, at])).rows.map(r => [Number(r.ref), r.content]);
    assert.deepEqual(await asOf(beforeEdits), [[1, "backend lead"]]);
    assert.deepEqual(await asOf(new Date(Date.now() + 60_000).toISOString()), [[3, "open"]]);
    assert.equal(await (async () => (await db.query<any>(
      "select has_function_privilege('authenticated', 'talent_contexts_as_of_v1(uuid,timestamptz)', 'EXECUTE') ok")).rows[0].ok)(), false);

    // The Talent account takes its history along.
    await db.exec(`delete from talent_users where user_id = '${talent}';`);
    assert.deepEqual(await behavior(), []);
    assert.deepEqual(await memos(), []);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    for (const table of ["talent_behavior_context_revisions", "talent_context_revisions"]) {
      assert.equal(await can(`has_table_privilege('service_role', '${table}', 'SELECT')`), true);
      assert.equal(await can(`has_table_privilege('service_role', '${table}', 'INSERT')`), false);
      assert.equal(await can(`has_table_privilege('authenticated', '${table}', 'SELECT')`), false);
      assert.equal(await can(`(select relrowsecurity from pg_class where relname = '${table}')`), true);
    }
  } finally { await db.close(); }
});
