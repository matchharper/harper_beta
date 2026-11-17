import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// #105: a company closure without a separate notice still shows as closed on
// the candidate's screen. The daily notice source, its eligibility rule, the
// current-recommendation rule and the new trigger come from their migrations;
// only the rows they read are created here.
const SETUP = `
  create role anon; create role authenticated; create role service_role; create role harper_worker;
  create table public.talent_users(user_id uuid primary key, deleted_at timestamptz);
  create table public.company_roles(role_id uuid primary key, information jsonb not null default '{}',
    status text, source_type text);
  create table public.talent_opportunity_recommendation(id uuid primary key, talent_id uuid, role_id uuid,
    feedback text, saved_stage text, opportunity_type text, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now());
  create table public.company_intro_candidates(talent_id uuid, role_id uuid, recommendation_id uuid);
  create table public.opportunity_discovery_run(id uuid primary key);
  create table public.talent_progress(id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid,
    recommendation_id uuid, kind text, metadata jsonb not null default '{}', created_at timestamptz not null default now());
  grant usage on schema public to harper_worker;
  grant insert on public.talent_progress to harper_worker;
`;
const role = "10000000-0000-4000-8000-000000000001";
const testRole = "10000000-0000-4000-8000-000000000002";
const rec = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const talent = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function fixture(t: TestContext) {
  const pg = new PGlite();
  t.after(() => pg.close());
  await pg.exec(SETUP);
  const migration = (name: string) =>
    readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");
  const slice = (text: string, from: string, to: string) => text.slice(text.indexOf(from), text.indexOf(to));
  const history = await migration("20260928045449_company_first_score_reuse_and_recommendation_history.sql");
  await pg.exec(slice(history, "create or replace function public.current_talent_recommendation_id_v1",
    "create or replace view public.talent_effective_opportunity_recommendations_v1"));
  const daily = await migration("20261104153622_career_daily_processing.sql");
  await pg.exec(slice(daily, "create table public.career_daily_sources", "create index career_daily_sources_pending"));
  await pg.exec(slice(daily, "create function public.record_career_daily_source", "create trigger capture_career_role_closure"));
  await pg.exec(await migration("20261116070000_close_withheld_company_closures.sql"));
  await pg.exec(`
    insert into public.company_roles values ('${role}', '{}', 'active', 'internal'),
      ('${testRole}', '{"testOnly":"true"}', 'active', 'internal');
    insert into public.talent_users(user_id) select ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
      from generate_series(1, 12) n;`);
  const recommend = (n: number, fields: { feedback?: string | null; saved?: string | null; role?: string;
    type?: string; at?: string; talentNo?: number } = {}) =>
    pg.exec(`insert into public.talent_opportunity_recommendation(id, talent_id, role_id, feedback, saved_stage,
      opportunity_type, created_at, updated_at) values ('${rec(n)}', '${talent(fields.talentNo ?? n)}',
      '${fields.role ?? role}', ${fields.feedback === null ? "null" : `'${fields.feedback ?? "like"}'`},
      ${fields.saved === null ? "null" : `'${fields.saved ?? "connected"}'`}, '${fields.type ?? "internal_recommendation"}',
      '${fields.at ?? "2026-11-01T00:00:00Z"}', '2026-11-01T00:00:00Z')`);
  const close = (n: number, metadata: Record<string, unknown>, fields: { role?: string; talentNo?: number; as?: string } = {}) =>
    pg.exec(`${fields.as ? `set role ${fields.as};` : ""}
      insert into public.talent_progress(talent_id, role_id, recommendation_id, kind, metadata) values
      ('${talent(fields.talentNo ?? n)}', '${fields.role ?? role}', '${rec(n)}', 'org_stage_change', '${JSON.stringify(metadata)}');
      ${fields.as ? "reset role;" : ""}`);
  const stage = async (n: number) =>
    (await pg.query<{ saved_stage: string | null; updated_at: string }>(
      `select saved_stage, updated_at from public.talent_opportunity_recommendation where id = $1`, [rec(n)])).rows[0];
  const grantWorker = () =>
    pg.exec(`grant select on public.talent_progress to harper_worker;
      grant select, update on public.career_daily_sources to harper_worker;`);
  const link = (talentNo: number, current: number) =>
    pg.exec(`insert into public.company_intro_candidates values ('${talent(talentNo)}', '${role}', '${rec(current)}')`);
  const count = async (sql: string) => Number((await pg.query<{ n: number }>(`select count(*)::int as n ${sql}`)).rows[0].n);
  return { close, count, grantWorker, link, recommend, stage };
}

const withheld = { stage: "process_stopped", notifyCandidateOnClosure: false };

test("a withheld company closure closes the candidate's saved stage without any notice", async (t) => {
  const db = await fixture(t);
  await db.recommend(1);
  await db.close(1, withheld);

  assert.equal((await db.stage(1)).saved_stage, "closed");
  assert.equal(await db.count("from public.career_daily_sources"), 0);
  assert.equal(await db.count("from public.talent_progress where kind <> 'org_stage_change'"), 0);
});

test("a closure the company allowed to announce keeps the notice path unchanged", async (t) => {
  const db = await fixture(t);
  await db.recommend(1);
  await db.close(1, { stage: "process_stopped", notifyCandidateOnClosure: true });
  await db.recommend(2);
  await db.close(2, { stage: "process_stopped" });

  assert.equal((await db.stage(1)).saved_stage, "connected");
  assert.equal((await db.stage(2)).saved_stage, "connected");
  assert.equal(await db.count("from public.career_daily_sources where source_kind = 'process_closure'"), 2);
});

test("an archive closure without a notice closes too", async (t) => {
  const db = await fixture(t);
  await db.recommend(1, { saved: "accepted" });
  await db.close(1, { stage: "archived", notifyCandidateOnClosure: false });

  assert.equal((await db.stage(1)).saved_stage, "closed");
});

test("only an accepted internal process the candidate still has open is closed", async (t) => {
  const db = await fixture(t);
  await db.recommend(1, { saved: "hidden" });
  await db.recommend(2, { saved: "closed" });
  await db.recommend(3, { feedback: null, saved: null });
  await db.recommend(4, { role: testRole });
  const closedBefore = await db.stage(2);
  for (const n of [1, 2, 3]) await db.close(n, withheld);
  await db.close(4, withheld, { role: testRole });

  assert.equal((await db.stage(1)).saved_stage, "hidden");
  assert.deepEqual(await db.stage(2), closedBefore);
  assert.equal((await db.stage(3)).saved_stage, null);
  assert.equal((await db.stage(4)).saved_stage, "connected");
});

test("a closure recorded on a superseded recommendation closes the candidate's current one", async (t) => {
  const db = await fixture(t);
  await db.recommend(1);
  await db.recommend(2, { type: "intro_request", at: "2026-11-05T00:00:00Z", talentNo: 1 });
  await db.link(1, 2);
  await db.close(1, withheld);

  assert.equal((await db.stage(1)).saved_stage, "connected");
  assert.equal((await db.stage(2)).saved_stage, "closed");
});

test("a worker-written withheld closure closes without the worker reading recommendations", async (t) => {
  const db = await fixture(t);
  await db.recommend(1);
  // The worker may write progress (and the existing daily-source trigger it
  // fires) but cannot read or update recommendations itself.
  await db.grantWorker();
  await db.close(1, withheld, { as: "harper_worker" });

  assert.equal((await db.stage(1)).saved_stage, "closed");
});
