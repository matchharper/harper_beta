import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("search handoff requires delivery and records admission once, even after the run has completed", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table company_agent_web_action_jobs(id uuid, company_workspace_id uuid, actor_user_id uuid,
        role_id uuid, action_name text, action_context jsonb, status text, updated_at timestamptz);
      create table company_messages(id bigint, company_workspace_id uuid, role_id uuid, role text, metadata jsonb);
      create table admissions(workspace_id uuid, actor_id uuid, role_id uuid);
      -- Isolated admission stub, no Role fixture, matching worker or production transport.
      create function enqueue_company_matching_search_v1(w uuid, a uuid, r uuid) returns jsonb language plpgsql as $$
      begin
        insert into admissions values(w,a,r);
        return '{"status":"queued","runId":"synthetic-run"}'::jsonb;
      end $$;
    `);
    await db.exec(readFileSync("supabase/migrations/20261016000326_role_research_search_handoff.sql", "utf8"));
    const id = "00000000-0000-4000-8000-000000000001";
    await db.query(`insert into company_agent_web_action_jobs values($1,$1,$1,$1,'role_search_kickoff','{}','processing',now())`, [id]);
    await assert.rejects(db.query("select enqueue_company_research_search_v1($1)", [id]), /not_delivered/);
    const meta = { webActionJobId: id, companyMessageBatch: { batchId: "batch" } };
    await db.query("insert into company_messages values(1,$1,$1,'assistant',$2),(2,$1,$1,'assistant',$2)", [id, JSON.stringify(meta)]);
    await db.query(`update company_messages set metadata=metadata || '{"companyMessageReceipt":{"slackMessageTs":"1.1"}}' where id=1`);
    await assert.rejects(db.query("select enqueue_company_research_search_v1($1)", [id]), /not_delivered/);
    assert.equal((await db.query("select * from admissions")).rows.length, 0);
    await db.query(`update company_messages set metadata=metadata || '{"companyMessageReceipt":{"slackMessageTs":"1.2"}}' where id=2`);
    const first = await db.query("select enqueue_company_research_search_v1($1) as result", [id]);
    await db.query("update company_agent_web_action_jobs set status='completed_message' where id=$1", [id]);
    const retry = await db.query("select enqueue_company_research_search_v1($1) as result", [id]);
    assert.deepEqual(first.rows, retry.rows);
    assert.equal((await db.query("select * from admissions")).rows.length, 1);
    for (const actor of ["anon", "authenticated", "service_role"]) {
      const result = await db.query<{ allowed: boolean }>("select has_function_privilege($1,'enqueue_company_research_search_v1(uuid)','execute') as allowed", [actor]);
      assert.equal(result.rows[0].allowed, actor === "service_role");
    }
  } finally { await db.close(); }
});
