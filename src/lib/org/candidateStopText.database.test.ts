import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// 20261116073000: a candidate's own stop reason stays with Harper. The shared
// text of their stop says only that they asked to stop; a company's stop keeps
// its reason; metadata.stopNote stays. Same check as a local PostgreSQL 16 run.
async function database() {
  const db = new PGlite();
  await db.exec(`
    create table public.talent_progress(id uuid primary key default gen_random_uuid(), kind text, metadata jsonb, text text,
      open_to_talent boolean default false, open_to_company boolean default false, created_at timestamptz default now());
    create function public.noop() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger talent_progress_behavior_context_change after update on public.talent_progress for each row execute function public.noop();
  `);
  // The trigger function as 20260930120510 left it (without its row refresh).
  const previous = readFileSync("supabase/migrations/20260930120510_closure_notice_shared_text_reason.sql", "utf8");
  await db.exec(previous.slice(0, previous.indexOf("-- Refresh affected public wording")));
  return db;
}
const insert = (db: PGlite, metadata: Record<string, unknown>) =>
  db.query<any>("insert into public.talent_progress(kind,metadata,text) values('org_stage_change',$1,'x') returning text, metadata", [metadata]);
const candidateStop = { source: "career_position_tab", stage: "process_stopped", stopReason: "candidate", stopNote: "연봉이 낮아서요" };

test("a candidate's stop shows the company that they stopped, not their reason", async () => {
  const db = await database();
  const before = (await insert(db, candidateStop)).rows[0];
  assert.match(before.text, /이유: 연봉이 낮아서요/);
  const migration = readFileSync("supabase/migrations/20261116073000_candidate_stop_reason_harper_only.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration); // a re-run changes nothing
  const after = (await insert(db, candidateStop)).rows[0];
  assert.equal(after.text, "후보자가 진행 중단을 요청하여 이 포지션의 프로세스가 종료되었습니다.");
  assert.equal(after.metadata.stopNote, "연봉이 낮아서요");
  // A company's own stop keeps its reason.
  const company = (await insert(db, { stage: "process_stopped", stopNote: "경력 부족" })).rows[0];
  assert.match(company.text, /이유: 경력 부족/);
  // Existing rows change only with the operator's refresh (the backfill).
  assert.match((await db.query<any>("select text from public.talent_progress order by created_at limit 1")).rows[0].text, /이유: 연봉이 낮아서요/);
  await db.exec("update public.talent_progress set kind = kind where metadata->>'stopReason' = 'candidate'");
  const visible = await db.query<any>("select count(*)::int n from public.talent_progress where metadata->>'stopReason'='candidate' and position('연봉' in text) > 0");
  assert.equal(visible.rows[0].n, 0);
});
