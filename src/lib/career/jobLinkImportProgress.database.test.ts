import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(new URL(
  "../../../supabase/migrations/20261022132918_preserve_job_link_import_progress.sql", import.meta.url,
), "utf8");
const talent = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000002";
const role = {
  canonicalUrl: "https://example.com/jobs/engineer",
  roleUrlVariants: ["https://example.com/jobs/engineer"],
  userSubmittedSourceJobId: "url:engineer",
  title: "Engineer", companyName: "Fixture Company",
};

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table talent_users (user_id uuid primary key);
    create table company_workspace (
      company_workspace_id uuid primary key default gen_random_uuid(), company_name text,
      published_name text, company_db_id integer, career_url text, logo_url text,
      company_description text, external_roles_enabled boolean, has_career_page boolean,
      is_internal boolean, is_scrape_original boolean, created_at timestamptz, updated_at timestamptz
    );
    create table company_roles (
      role_id uuid primary key default gen_random_uuid(), company_workspace_id uuid, name text,
      description text, external_jd_url text, information jsonb, is_expired boolean,
      location_text text, salary_range text, source_job_id text, source_provider text,
      source_type text, status text, summary jsonb, type text[], work_mode text,
      created_at timestamptz, updated_at timestamptz
    );
    create table talent_opportunity_recommendation (
      id uuid primary key default gen_random_uuid(), talent_id uuid, role_id uuid, kind text,
      opportunity_type text, saved_stage text, feedback text, feedback_at timestamptz,
      feedback_reason text, dismissed_at timestamptz, evidence jsonb, fit_reasons jsonb,
      fit_summary text, preference_fit jsonb, tradeoffs jsonb, recommended_at timestamptz,
      created_at timestamptz, updated_at timestamptz
    );
    -- The migration replaces the existing six-argument RPC without overloading it.
    create function import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb)
      returns void language sql as 'select';
  `);
  await db.exec(migration);
  await db.query("insert into talent_users values ($1)", [talent]);
  return db;
}

async function importLink(db: PGlite, options: {
  stage?: string; preserve?: boolean; existingRoleId?: string;
} = {}) {
  const values: unknown[] = [talent, options.stage ?? "saved", options.existingRoleId ?? null,
    null, JSON.stringify(role), "{}"];
  if (options.preserve !== undefined) values.push(options.preserve);
  const { rows } = await db.query<Record<string, unknown>>(
    `select * from import_talent_job_link(${values.map((_, i) => `$${i + 1}`).join(",")})`, values,
  );
  return rows[0];
}

test("agent re-saves preserve progress and all recommendation facts; explicit history changes still work", async () => {
  const db = await database();
  try {
    await db.query("insert into company_roles(role_id,source_type,source_provider,external_jd_url) values ($1,'external','fixture',$2)", [roleId, role.canonicalUrl]);
    const first = await importLink(db, {preserve:true, existingRoleId:roleId});
    assert.equal(first.created_recommendation, true);
    assert.equal(first.saved_stage, "saved");
    for (const stage of ["saved", "applied", "connected", "closed", "future_progress_stage"]) {
      await db.query(`update talent_opportunity_recommendation set saved_stage=$1,
        feedback_reason='Retain original decision', dismissed_at='2026-01-01',
        recommended_at='2026-01-02', updated_at='2026-01-03' where id=$2`, [stage, first.recommendation_id]);
      const before = await db.query("select * from talent_opportunity_recommendation");
      // No pre-resolved role: also covers the DB finding a role/recommendation
      // created after the web caller's earlier lookup.
      const repeated = await importLink(db, {preserve:true});
      assert.equal(repeated.recommendation_id, first.recommendation_id);
      assert.equal(repeated.created_recommendation, false);
      assert.equal(repeated.saved_stage, stage);
      assert.deepEqual((await db.query("select * from talent_opportunity_recommendation")).rows, before.rows);
    }
    // Existing six-argument manual imports explicitly select their desired stage.
    const moved = await importLink(db, {stage:"closed", existingRoleId:roleId});
    assert.equal(moved.saved_stage, "closed");
    const saved = (await db.query<{feedback_reason: string | null}>("select feedback_reason from talent_opportunity_recommendation")).rows[0];
    assert.equal(saved.feedback_reason, null);
  } finally { await db.close(); }
});

test("new and unsaved/hidden postings can still be saved; the mutation remains server-only", async () => {
  const db = await database();
  try {
    const first = await importLink(db, {preserve:true});
    assert.equal(first.created_role, true);
    assert.equal(first.created_workspace, true);
    assert.equal(first.saved_stage, "saved");
    for (const stage of [null, "hidden"]) {
      await db.query("update talent_opportunity_recommendation set saved_stage=$1,feedback='dislike',dismissed_at=now()", [stage]);
      const saved = await importLink(db, {preserve:true});
      assert.equal(saved.recommendation_id, first.recommendation_id);
      assert.equal(saved.saved_stage, "saved");
      const row = (await db.query<{feedback:string; dismissed_at: null}>("select feedback,dismissed_at from talent_opportunity_recommendation")).rows[0];
      assert.equal(row.feedback, "like");
      assert.equal(row.dismissed_at, null);
    }
    const signature = "import_talent_job_link(uuid,text,uuid,uuid,jsonb,jsonb,boolean)";
    for (const [name, permitted] of [["anon", false], ["authenticated", false], ["service_role", true]] as const) {
      const {rows} = await db.query<{allowed: boolean}>("select has_function_privilege($1,$2,'EXECUTE') as allowed", [name,signature]);
      assert.equal(rows[0].allowed, permitted);
    }
  } finally { await db.close(); }
});
