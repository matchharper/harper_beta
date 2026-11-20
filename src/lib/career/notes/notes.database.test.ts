import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const owner = id(1), other = id(2), matching = id(3), othersMatching = id(4), company = id(5);

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users(user_id uuid primary key, deleted_at timestamptz);
    create table company_workspace(company_workspace_id uuid primary key, company_name text);
    create table talent_matchings(id uuid primary key, talent_id uuid not null references talent_users(user_id), title text not null,
      previous_matching_id uuid);
    create table talent_contexts(id bigserial primary key, talent_id uuid, collection text, content text);
    create table talent_integrations(talent_id uuid, provider text, status text, career_mail_sync jsonb);
    create table talent_opportunity_recommendation(id uuid primary key, talent_id uuid, role_id uuid,
      feedback text, saved_stage text, feedback_reason text);
    create table talent_external_operations(id uuid, user_id uuid, kind text, request jsonb, created_at timestamptz);
    create table talent_matching_operations(id bigserial primary key, talent_id uuid, operation_id text, command jsonb, result jsonb);
    create table talent_opportunity_memberships(matching_id uuid, role_id uuid);
  `);
  for (const file of ["20261117115947_career_matching_research_notes", "20261117195500_career_matching_note_activity",
    "20261117203000_career_matching_feedback_note_never_blocks"])
    await db.exec(await readFile(`supabase/migrations/${file}.sql`, "utf8"));
  await db.query("insert into talent_users(user_id) values ($1), ($2)", [owner, other]);
  await db.query("insert into company_workspace values ($1, 'Acme')", [company]);
  await db.query("insert into talent_matchings(id, talent_id, title) values ($1, $2, 'LLM 백엔드'), ($3, $4, 'Other')",
    [matching, owner, othersMatching, other]);
  return db;
}

const write = (db: PGlite, args: Record<string, unknown>) => {
  const names = Object.keys(args);
  return db.query<{ result: Record<string, any> }>(
    `select public.write_career_note_v1(${names.map((name, index) => `${name} => $${index + 1}`).join(", ")}) as result`,
    Object.values(args)).then(r => r.rows[0].result);
};

test("each matching's own thinking moves into one work note and the old note is removed", async () => {
  const db = await database();
  await db.query("insert into talent_matching_notes(matching_id, revision, next_number) values ($1, 4, 4)", [matching]);
  await db.query(`insert into talent_matching_note_entries(matching_id, number, body, kind, created_at) values
    ($1, 0, '결제 경험이 바로 쓰이는 팀부터 본다', 'harper', '2026-11-10T01:00:00Z'),
    ($1, 1, '인프라 쪽은 반응이 약했다' || E'\\n→ ' || 'Searched postings: 400 evaluated', 'activity', '2026-11-10T02:00:00Z'),
    ($1, 2, 'Searched companies: 150 evaluated', 'activity', '2026-11-10T03:00:00Z'),
    ($1, 3, 'User liked A사.', 'user', '2026-11-10T04:00:00Z'),
    ($1, 4, 'E·F·G사는 인원 감축 기사로 뺐다', 'harper', '2026-11-11T05:00:00Z')`, [matching]);
  await db.exec(await readFile("supabase/migrations/20261119210000_career_talent_notes.sql", "utf8"));
  const notes = (await db.query<Record<string, any>>("select * from talent_notes")).rows;
  assert.equal(notes.length, 1);
  assert.equal(notes[0].kind, "work");
  assert.equal(notes[0].matching_id, matching);
  assert.equal(notes[0].title, "LLM 백엔드 탐색");
  assert.equal(notes[0].content, "결제 경험이 바로 쓰이는 팀부터 본다\n인프라 쪽은 반응이 약했다\nE·F·G사는 인원 감축 기사로 뺐다");
  for (const name of ["talent_matching_note_entries", "talent_matching_notes"])
    assert.equal((await db.query<{ t: string | null }>(`select to_regclass('public.${name}')::text as t`)).rows[0].t, null);
  // A reaction no longer writes anywhere but its own row.
  await db.query("insert into talent_opportunity_recommendation(id, talent_id, feedback) values ($1, $2, null)", [id(9), owner]);
  await db.query("update talent_opportunity_recommendation set feedback = 'negative' where id = $1", [id(9)]);
  const columns = (await db.query<{ c: string }>(
    "select column_name as c from information_schema.columns where table_name = 'talent_contexts'")).rows.map(r => r.c);
  assert.ok(columns.includes("company_workspace_id"));
});

test("notes are created, appended, partly replaced, rewritten at a revision and deleted by their owner only", async () => {
  const db = await database();
  await db.exec(await readFile("supabase/migrations/20261119210000_career_talent_notes.sql", "utf8"));
  const created = await write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "think",
    p_title: "AI 제품 백엔드부터", p_content: "결제 경험을 살린다.", p_company: company });
  assert.equal(created.revision, 1);
  assert.equal(created.company_workspace_id, company);
  const note = created.id;
  const appended = await write(db, { p_talent: owner, p_note: note, p_action: "update", p_append: "연구 비중이 높은 팀은 미룬다." });
  assert.equal(appended.content, "결제 경험을 살린다.\n\n연구 비중이 높은 팀은 미룬다.");
  assert.equal(appended.revision, 2);
  const replaced = await write(db, { p_talent: owner, p_note: note, p_action: "update",
    p_replace_old: "미룬다", p_replace_new: "다시 본다" });
  assert.match(replaced.content, /다시 본다/);
  await write(db, { p_talent: owner, p_note: note, p_action: "update", p_append: "다시 본다" });
  await assert.rejects(write(db, { p_talent: owner, p_note: note, p_action: "update", p_replace_old: "다시 본다", p_replace_new: "x" }),
    /appears 2 times/);
  await assert.rejects(write(db, { p_talent: owner, p_note: note, p_action: "update", p_content: "새 글" }),
    /needs the revision/);
  await assert.rejects(write(db, { p_talent: owner, p_note: note, p_action: "update", p_content: "새 글", p_expected_revision: 1 }),
    /changed \(expected revision 1, current revision 4\)/);
  const rewritten = await write(db, { p_talent: owner, p_note: note, p_action: "update", p_content: "새 글", p_expected_revision: 4 });
  assert.equal(rewritten.content, "새 글");
  await assert.rejects(write(db, { p_talent: other, p_note: note, p_action: "update", p_append: "x" }), /unavailable/);
  await assert.rejects(write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "work", p_title: "x",
    p_matching: othersMatching }), /Matching .* is unavailable/);
  await assert.rejects(write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "plan", p_title: "x" }),
    /think or work/);
  await assert.rejects(write(db, { p_talent: owner, p_note: note, p_action: "delete" }), /needs the revision/);
  assert.deepEqual(await write(db, { p_talent: owner, p_note: note, p_action: "delete", p_expected_revision: 5 }),
    { id: note, deleted: true });
});

test("disconnecting Gmail removes the notes written from that mailbox and keeps the others", async () => {
  const db = await database();
  await db.exec(await readFile("supabase/migrations/20261119210000_career_talent_notes.sql", "utf8"));
  await db.query("insert into talent_integrations values ($1, 'gmail', 'active', '{\"generation\":\"g1\"}')", [owner]);
  const fromMail = await write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "work", p_title: "B사 지원",
    p_content: "면접 일정 메일을 받았다.", p_source_refs: JSON.stringify([{ type: "gmail", generation: "g1" }]) });
  const plain = await write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "think", p_title: "방향",
    p_content: "제품 백엔드부터." });
  const later = await write(db, { p_talent: owner, p_note: plain.id, p_action: "update", p_append: "메일 내용 반영",
    p_source_refs: JSON.stringify([{ type: "gmail", generation: "g1" }]) });
  assert.equal(later.revision, 2);
  await db.query("update talent_integrations set status = 'revoked' where talent_id = $1", [owner]);
  const remaining = (await db.query<{ id: string }>("select id from talent_notes")).rows.map(r => r.id);
  assert.deepEqual(remaining, []);
  const kept = await write(db, { p_talent: owner, p_note: null, p_action: "create", p_kind: "think", p_title: "새 방향", p_content: "x" });
  await db.query("delete from talent_integrations where talent_id = $1", [owner]);
  assert.deepEqual((await db.query<{ id: string }>("select id from talent_notes")).rows.map(r => r.id), [kept.id]);
});
