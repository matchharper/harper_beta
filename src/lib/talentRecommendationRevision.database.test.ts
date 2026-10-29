import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("stale recommendation timestamps do not block decisions; owner checks still apply", async () => {
  const db = new PGlite();
  const talent = "00000000-0000-4000-8000-000000000001";
  const rec = "00000000-0000-4000-8000-000000000002";
  try {
    await db.exec(`
      create table talent_opportunity_recommendation (
        id uuid primary key, talent_id uuid, role_id uuid, updated_at timestamptz,
        feedback text, saved_stage text, feedback_at timestamptz, feedback_reason text,
        email_acceptance_confirmation jsonb
      );
      create table company_roles (role_id uuid, source_type text);
      create table talent_opportunity_tag (talent_id uuid, opportunity_id uuid, tag text);
      create function current_talent_recommendation_id_v1(uuid) returns uuid language sql as 'select $1';
      create function accept_talent_internal_role_recommendation_v1(uuid,uuid,uuid,text,jsonb,jsonb)
        returns jsonb language sql as $$ select '{"status":"accepted"}'::jsonb $$;
      create function decide_company_intro_request_v1(uuid,uuid,text,text,jsonb)
        returns jsonb language sql as $$ select jsonb_build_object('decision',$3) $$;
      create function update_talent_role_feedback_v1(uuid,uuid,text,text,text,timestamptz)
        returns jsonb language sql as $$ select jsonb_build_object('feedback',$3) $$;
      insert into talent_opportunity_recommendation(id,talent_id,updated_at)
        values ('${rec}','${talent}','2026-10-28 03:58:18+00');
    `);
    const migration = await readFile(new URL("../../supabase/migrations/20261028051955_remove_recommendation_timestamp_conflicts.sql", import.meta.url), "utf8");
    await db.exec(migration);
    const accepted = await db.query<{ result: { status: string } }>(
      "select accept_talent_internal_role_recommendation_v2($1,$2,p_expected_updated_at => '2026-01-01') as result", [talent, rec]);
    assert.equal(accepted.rows[0].result.status, "accepted");
    const intro = await db.query<{ result: { decision: string } }>(
      "select decide_company_intro_request_v2($1,$2,'accept',p_expected_updated_at => '2026-01-01') as result", [talent, rec]);
    assert.equal(intro.rows[0].result.decision, "accept");
    const feedback = await db.query<{ result: { feedback: string } }>(
      "select update_talent_role_feedback_v2($1,$2,'like',null,'applied',now(),'2026-01-01') as result", [talent, rec]);
    assert.equal(feedback.rows[0].result.feedback, "like");
    for (const query of [
      "select accept_talent_internal_role_recommendation_v2($1,$2)",
      "select decide_company_intro_request_v2($1,$2,'accept')",
      "select update_talent_role_feedback_v2($1,$2,'like',null,'applied',now())",
    ]) {
      await assert.rejects(db.query(query, ["00000000-0000-4000-8000-000000000003", rec]), /not_found/);
    }
  } finally { await db.close(); }
});
