import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Quick successive decisions join one company Harper run (G1b, D12).
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    conversation_id uuid, role_id uuid, actor_user_id uuid, action_name text, action_context jsonb,
    idempotency_key text unique, status text not null default 'queued', created_at timestamptz default clock_timestamp(),
    updated_at timestamptz default now());
  -- Stand-in for the production enqueue (same signature and result).
  create function enqueue_company_agent_web_action_v1(p_company_workspace_id uuid, p_conversation_id uuid,
    p_role_id uuid, p_actor_user_id uuid, p_action_name text, p_action_context jsonb, p_idempotency_key text)
  returns table(job_id uuid, created boolean) language plpgsql security definer set search_path = public, pg_temp as $$
  declare v_id uuid;
  begin
    select id into v_id from company_agent_web_action_jobs where idempotency_key = p_idempotency_key;
    if v_id is not null then return query select v_id, false; return; end if;
    insert into company_agent_web_action_jobs(company_workspace_id, conversation_id, role_id, actor_user_id, action_name,
      action_context, idempotency_key) values (p_company_workspace_id, p_conversation_id, p_role_id, p_actor_user_id,
      p_action_name, p_action_context, p_idempotency_key) returning id into v_id;
    return query select v_id, true;
  end $$;
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const conversation = "10000000-0000-4000-8000-000000000002";
const other = "10000000-0000-4000-8000-000000000003";
const actor = "10000000-0000-4000-8000-000000000004";

test("decisions in quick succession join one queued run; a repeated event is not added twice", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261105200000_company_agent_web_action_batching.sql", import.meta.url), "utf8"));
    const enqueue = async (key: string, context: object, where = conversation, window = 45) => (await db.query<any>(
      `select * from enqueue_company_agent_web_action_batched_v1($1, $2, null, $3, 'company_intro_decision', $4::jsonb, $5, $6)`,
      [workspace, where, actor, JSON.stringify(context), key, window])).rows[0];
    const context = async (id: string) =>
      (await db.query<any>("select action_context c from company_agent_web_action_jobs where id = $1", [id])).rows[0].c;

    const first = await enqueue("pass:a", { decision: "pass", introCandidateId: "a" });
    assert.equal(first.created, true);
    assert.ok(new Date(first.batch_until).getTime() > Date.now());
    const second = await enqueue("request:b", { decision: "request_intro", introCandidateId: "b" });
    assert.equal(second.job_id, first.job_id);
    assert.equal(second.created, false);
    const again = await enqueue("pass:a", { decision: "pass", introCandidateId: "a" });
    assert.equal(again.job_id, first.job_id);
    const collected = await context(first.job_id);
    assert.deepEqual(collected.decisions.map((item: any) => item.introCandidateId), ["a", "b"]);
    assert.deepEqual(collected.batchKeys, ["pass:a", "request:b"]);

    // Another conversation has its own run.
    assert.notEqual((await enqueue("pass:c", { introCandidateId: "c" }, other)).job_id, first.job_id);
    // Once the run started or its window ended, a new event opens a new run.
    await db.query("update company_agent_web_action_jobs set status = 'processing' where id = $1", [first.job_id]);
    const next = await enqueue("pass:d", { introCandidateId: "d" });
    assert.notEqual(next.job_id, first.job_id);
    await db.query(`update company_agent_web_action_jobs set action_context = jsonb_set(action_context, '{batchUntil}', '"2000-01-01T00:00:00Z"') where id = $1`, [next.job_id]);
    assert.notEqual((await enqueue("pass:e", { introCandidateId: "e" })).job_id, next.job_id);

    await assert.rejects(enqueue("pass:f", {}, conversation, 0), /company_agent_batch_window_invalid/);
    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    const signature = "enqueue_company_agent_web_action_batched_v1(uuid,uuid,uuid,uuid,text,jsonb,text,integer)";
    assert.equal(await can(`has_function_privilege('service_role', '${signature}', 'EXECUTE')`), true);
    assert.equal(await can(`has_function_privilege('authenticated', '${signature}', 'EXECUTE')`), false);
  } finally { await db.close(); }
});

test("a teammate's decision in the same conversation opens their own run (#262)", async () => {
  const db = new PGlite();
  const teammate = "10000000-0000-4000-8000-000000000006";
  try {
    await db.exec(SETUP);
    for (const name of ["20261105200000_company_agent_web_action_batching.sql", "20261107050300_company_agent_batch_per_decider.sql"])
      await db.exec(await readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    const enqueue = async (key: string, by: string) => (await db.query<any>(
      `select * from enqueue_company_agent_web_action_batched_v1($1, $2, null, $3, 'company_intro_decision', $4::jsonb, $5, 45)`,
      [workspace, conversation, by, JSON.stringify({ introCandidateId: key }), key])).rows[0];
    const runOf = async (id: string) => (await db.query<any>(
      "select actor_user_id, action_context c from company_agent_web_action_jobs where id = $1", [id])).rows[0];

    const first = await enqueue("pass:a", actor);
    const theirs = await enqueue("pass:b", teammate);
    const mine = await enqueue("request:c", actor);
    assert.notEqual(theirs.job_id, first.job_id);
    assert.equal(theirs.created, true);
    assert.equal(mine.job_id, first.job_id);
    // Each run is one person's decisions and runs as that person.
    assert.deepEqual([(await runOf(first.job_id)).actor_user_id, (await runOf(first.job_id)).c.batchKeys], [actor, ["pass:a", "request:c"]]);
    assert.deepEqual([(await runOf(theirs.job_id)).actor_user_id, (await runOf(theirs.job_id)).c.batchKeys], [teammate, ["pass:b"]]);
    // A repeated event still finds the run it joined, whoever sends it again.
    assert.equal((await enqueue("pass:b", actor)).job_id, theirs.job_id);
    assert.equal((await db.query<any>("select count(*)::int n from company_agent_web_action_jobs")).rows[0].n, 2);
  } finally { await db.close(); }
});
