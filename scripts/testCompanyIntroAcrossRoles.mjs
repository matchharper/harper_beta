// Isolated PostgreSQL regression test. No credentials or network access.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const scalar = async (sql, args = []) =>
  Object.values((await db.query(sql, args)).rows[0])[0];
const original = readFileSync(new URL(
  "../supabase/migrations/20260917162551_company_first_talent_search.sql",
  import.meta.url
), "utf8");
const migration = readFileSync(new URL(
  "../supabase/migrations/20260928013822_allow_company_intro_across_roles.sql",
  import.meta.url
), "utf8");

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table company_roles (
      role_id uuid primary key, company_workspace_id uuid, source_type text,
      information jsonb not null
    );
    create table company_intro_candidates (
      id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
      role_id uuid, talent_id uuid, status text, recommendation_id uuid,
      requested_at timestamptz, next_stage_id uuid, intro_recipient_emails text[],
      delivery_run_id uuid, close_reason text, revision integer default 1,
      updated_at timestamptz default now()
    );
    create unique index company_intro_candidates_active_workspace_talent_idx
      on company_intro_candidates(company_workspace_id,talent_id)
      where status in ('ready','awaiting_talent','connecting');
    create unique index company_intro_candidates_active_pair_idx
      on company_intro_candidates(role_id,talent_id)
      where status in ('ready','awaiting_talent','connecting');
    create table talent_opportunity_recommendation (
      id uuid primary key default gen_random_uuid(), role_id uuid, talent_id uuid,
      opportunity_type text, discovery_run_id uuid
    );
    create table talent_progress (
      role_id uuid, talent_id uuid, kind text
    );
  `);
  for (const name of [
    "guard_candidate_first_against_company_intro_v1",
    "route_candidate_priority_request_v1",
  ]) {
    const start = original.indexOf(`create or replace function public.${name}()`);
    const end = original.indexOf("\n$$;", start) + 4;
    assert.ok(start >= 0 && end > start);
    await db.exec(original.slice(start, end));
    await db.exec(`revoke all on function ${name}() from public,anon,authenticated;
      grant execute on function ${name}() to service_role;`);
  }
  await db.exec(`
    create trigger talent_recommendation_company_intro_guard
      before insert or update of role_id,talent_id on talent_opportunity_recommendation
      for each row execute function guard_candidate_first_against_company_intro_v1();
    create trigger talent_progress_company_intro_route
      before insert or update of kind,role_id,talent_id on talent_progress
      for each row when (new.kind = 'candidate_requested_connection')
      execute function route_candidate_priority_request_v1();
  `);

  const workspace = randomUUID(), talent = randomUUID();
  const roles = [randomUUID(), randomUUID(), randomUUID()];
  for (const role of roles) {
    await db.query("insert into company_roles values ($1,$2,'internal',$3)", [
      role, workspace, JSON.stringify({
        testOnly: true, testFixture: "company-intro-across-roles-v1",
        testTalentIds: [talent],
      }),
    ]);
  }
  const addReady = (role) => scalar(`insert into company_intro_candidates
    (company_workspace_id,role_id,talent_id,status)
    values ($1,$2,$3,'ready') returning id`, [workspace, role, talent]);
  const recommend = (role, type = "internal_recommendation", run = null) =>
    scalar(`insert into talent_opportunity_recommendation
      (role_id,talent_id,opportunity_type,discovery_run_id)
      values ($1,$2,$3,$4) returning id`, [role, talent, type, run]);
  const request = (role) => db.query(`insert into talent_progress
    values ($1,$2,'candidate_requested_connection')`, [role, talent]);
  const status = (id) => scalar(
    "select status from company_intro_candidates where id=$1", [id]
  );

  const first = await addReady(roles[0]);
  await assert.rejects(addReady(roles[1]), /company_intro_candidates_active_workspace_talent_idx/);
  await assert.rejects(recommend(roles[2]), /active company-first route/);
  await db.exec(migration);
  const second = await addReady(roles[1]);
  await assert.rejects(addReady(roles[1]), /company_intro_candidates_active_pair_idx/);
  await recommend(roles[2]);
  await assert.rejects(recommend(roles[0]), /active company-first route/);

  const run = randomUUID();
  await db.query(`update company_intro_candidates
    set status='awaiting_talent',requested_at=now(),next_stage_id=$2,
      intro_recipient_emails=array['synthetic@example.invalid'],delivery_run_id=$3
    where id=$1`, [first, randomUUID(), run]);
  await assert.rejects(recommend(roles[0], "intro_request", randomUUID()), /another company-first route/);
  await recommend(roles[0], "intro_request", run);
  assert.equal(await status(second), "ready", "another Role's ready card survives delivery");
  await request(roles[2]);
  assert.equal(await status(first), "awaiting_talent");
  assert.equal(await status(second), "ready");
  await request(roles[1]);
  assert.equal(await status(second), "closed", "explicit request closes the exact Role card");
  assert.equal(await status(first), "awaiting_talent", "another Role's request stays active");
  await assert.rejects(request(roles[0]), /active company-first request/);
  await db.query("update company_intro_candidates set status='connecting' where id=$1", [first]);
  await recommend(roles[1]);
  await assert.rejects(recommend(roles[0]), /active company-first route/);
  await assert.rejects(request(roles[0]), /active company-first request/);
  assert.equal(await scalar("select has_function_privilege('anon','guard_candidate_first_against_company_intro_v1()','execute')"), false);
  assert.equal(await scalar("select has_function_privilege('service_role','guard_candidate_first_against_company_intro_v1()','execute')"), true);
  console.log("PASS: cross-Role cards, recommendations, and requests; same-Role uniqueness, delivery ownership, and service-only grants");
} finally {
  await db.close();
}
