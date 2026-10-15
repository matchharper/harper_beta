import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Disposable database: no application connection, real accounts or outbound work.
test("manual queue migration enforces service access, fixture exclusion and scoped schedule override", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_roles(role_id uuid, company_workspace_id uuid, source_type text, status text,
        is_expired boolean, expires_at timestamptz, information jsonb);
      create table company_internal_roles(role_id uuid, request text);
      create table company_first_search_runs(id uuid default gen_random_uuid(), company_workspace_id uuid,
        role_id uuid, scheduled_slot timestamptz, trigger_reason text, contract_version text, status text,
        available_at timestamptz, scheduled_role_ids uuid[], requested_role_ids uuid[], created_at timestamptz default now());
      create table talent_opportunity_matching_review(opportunity_id uuid, decision text, run_id uuid);
      create function role_matching_slot_type_v1(uuid,timestamptz) returns text language sql as $$select 'paid'::text$$;
      create function enqueue_company_matching_search_v1(uuid,uuid,uuid) returns jsonb language plpgsql as $$
      begin
        perform 1 from company_first_search_runs run where true and run.status = 'queued';
        return '{}'::jsonb;
      end $$;
    `);
    await db.exec(
      readFileSync(
        resolve(
          "supabase/migrations/20261015032720_manual_talent_first_search.sql"
        ),
        "utf8"
      )
    );
    await db.exec(`create trigger selection_guard before insert on talent_opportunity_matching_review
      for each row execute function guard_talent_first_matching_selection_v1()`);
    const workspace = "00000000-0000-4000-8000-000000000001";
    const role = "00000000-0000-4000-8000-000000000002";
    const run = "00000000-0000-4000-8000-000000000003";
    await db.query(
      `insert into company_roles values ($1,$2,'internal','active',false,null,
      '{"testOnly":true,"testFixture":"manual-talent-first-migration"}')`,
      [role, workspace]
    );
    await db.query(
      "insert into company_internal_roles values ($1,'Synthetic fixture brief')",
      [role]
    );
    const rejected = await db.query<{ result: { status: string } }>(
      "select enqueue_talent_first_search_v1($1,$2) as result",
      [workspace, role]
    );
    assert.equal(rejected.rows[0].result.status, "not_queued");
    assert.equal(
      (await db.query("select * from company_first_search_runs")).rows.length,
      0
    );
    for (const actor of ["anon", "authenticated", "service_role"]) {
      const permission = await db.query<{ allowed: boolean }>(
        "select has_function_privilege($1,'enqueue_talent_first_search_v1(uuid,uuid)','execute') as allowed",
        [actor]
      );
      assert.equal(permission.rows[0].allowed, actor === "service_role");
    }
    const definition = await db.query<{ body: string }>(
      "select pg_get_functiondef('enqueue_company_matching_search_v1(uuid,uuid,uuid)'::regprocedure) as body"
    );
    assert.match(
      definition.rows[0].body,
      /run.trigger_reason <> 'talent_first_requested'/
    );
    // Direct synthetic rows exercise only the guard, never the matching worker.
    await db.query(
      `insert into company_first_search_runs(id,role_id,trigger_reason,scheduled_slot)
      values ($1,$2,'talent_first_requested','2026-09-13T00:00:00Z')`,
      [run, role]
    );
    await db.query(
      "insert into talent_opportunity_matching_review values ($1,'candidate_first',$2)",
      [role, run]
    );
    await assert.rejects(
      db.query(
        "insert into talent_opportunity_matching_review values ($1,'both',$2)",
        [role, run]
      ),
      /talent_first_requested_role_required/
    );
    await assert.rejects(
      db.query(
        "insert into talent_opportunity_matching_review values ($1,'candidate_first',$2)",
        [workspace, run]
      ),
      /talent_first_requested_role_required/
    );
    await db.query(
      "update company_first_search_runs set trigger_reason='scheduled' where id=$1",
      [run]
    );
    await assert.rejects(
      db.query(
        "insert into talent_opportunity_matching_review values ($1,'candidate_first',$2)",
        [role, run]
      ),
      /talent_first_role_run_schedule_required/
    );
  } finally {
    await db.close();
  }
});
