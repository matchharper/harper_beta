import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Operation ledger (G1a): every member and external search gets an operation in
// the transaction that creates it, linked to the company Harper run that started
// it; status and usage follow the work row; usage per company per kind.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid);
  create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    action_name text, status text, created_at timestamptz default now());
  create table company_first_search_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, status text, request_options jsonb default '{}', model_manifest jsonb, result jsonb,
    heartbeat_at timestamptz, started_at timestamptz, finished_at timestamptz, created_at timestamptz default now());
  create table external_sourcing_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, status text, cost jsonb, heartbeat_at timestamptz, started_at timestamptz, finished_at timestamptz,
    created_at timestamptz default now());
  -- The existing insert guard (production skips some scheduled slots by returning null).
  create function guard_scheduled_matching_slot_v1() returns trigger language plpgsql as $$
  begin
    if new.request_options->>'skip' = 'true' then return null; end if;
    return new;
  end $$;
  create trigger guard_scheduled_matching_slot before insert on company_first_search_runs
    for each row execute function guard_scheduled_matching_slot_v1();
`;

const workspace = "10000000-0000-4000-8000-000000000001";
const role = "10000000-0000-4000-8000-000000000002";
const job = "20000000-0000-4000-8000-000000000001";
const oldRun = "30000000-0000-4000-8000-000000000001";

test("searches get operations linked to their run; status and usage follow the work", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${workspace}');
      insert into company_roles values ('${role}', '${workspace}');
      insert into company_agent_web_action_jobs(id, company_workspace_id, action_name, status) values
        ('${job}', '${workspace}', 'scheduled_matching_review', 'completed_silent');
      insert into company_first_search_runs(id, company_workspace_id, role_id, status, request_options, model_manifest,
        result, started_at, finished_at) values ('${oldRun}', '${workspace}', '${role}', 'succeeded',
        '{"rootJobId":"${job}"}', '{"llmUsage":{"estimatedCostUsd":0.25,"usageComplete":true,
          "costSummary":{"inputTokens":100,"outputTokens":20}}}',
        '{"roleSearch":{"counts":{"evaluations":0,"inputTokens":900,"cachedInputTokens":50}}}',
        '2026-11-01T00:00:00Z', '2026-11-01T00:00:02Z');
    `);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261105190000_company_agent_operations.sql", import.meta.url), "utf8"));

    const operation = async (table: string, id: string) => (await db.query<any>(
      `select operation.* from ${table} work join company_agent_operations operation on operation.id = work.operation_id where work.id = $1`,
      [id])).rows[0];

    // Searches already in the database get their operations.
    const old = await operation("company_first_search_runs", oldRun);
    assert.equal(old.kind, "member_search");
    assert.equal(old.run_id, job);
    assert.equal(old.status, "succeeded");
    assert.deepEqual(old.usage, { costUsd: 0.25, costComplete: true, inputTokens: 1000, cachedInputTokens: 50,
      outputTokens: 20, evaluations: 0, elapsedMs: 2000 });

    // A new search: operation in the same insert, linked to its run; a bad root id is ignored.
    const created = (await db.query<any>(`insert into company_first_search_runs(company_workspace_id, role_id, status, request_options)
      values ($1, $2, 'queued', $3) returning id`, [workspace, role, JSON.stringify({ rootJobId: job })])).rows[0].id;
    const fresh = await operation("company_first_search_runs", created);
    assert.equal(fresh.status, "queued");
    assert.equal(fresh.run_id, job);
    const loose = (await db.query<any>(`insert into company_first_search_runs(company_workspace_id, status, request_options)
      values ($1, 'queued', '{"rootJobId":"not-a-uuid"}') returning id`, [workspace])).rows[0].id;
    assert.equal((await operation("company_first_search_runs", loose)).run_id, null);
    // A skipped insert opens nothing; a row without a company opens nothing.
    await db.exec(`insert into company_first_search_runs(company_workspace_id, status, request_options)
      values ('${workspace}', 'queued', '{"skip":"true"}');
      insert into company_first_search_runs(status) values ('queued');`);
    assert.equal((await db.query<any>("select count(*)::int n from company_agent_operations")).rows[0].n, 3);

    // A heartbeat does not touch the operation; finishing sets status and usage.
    const before = (await operation("company_first_search_runs", created)).updated_at;
    await db.query("update company_first_search_runs set heartbeat_at = now() where id = $1", [created]);
    assert.equal(String((await operation("company_first_search_runs", created)).updated_at), String(before));
    await db.query(`update company_first_search_runs set status = 'succeeded', started_at = '2026-11-05T00:00:00Z',
      finished_at = '2026-11-05T00:00:03Z', model_manifest = '{"llmUsage":{"estimatedCostUsd":0.1,"usageComplete":true}}',
      result = '{"roleSearch":{"counts":{"evaluations":4,"reusedEvaluations":2,"inputTokens":4000}}}' where id = $1`, [created]);
    const done = await operation("company_first_search_runs", created);
    assert.equal(done.status, "succeeded");
    assert.ok(done.finished_at);
    // Candidate evaluations are not priced, so the cost is not complete.
    assert.deepEqual(done.usage, { costUsd: 0.1, costComplete: false, inputTokens: 4000, evaluations: 4,
      reusedEvaluations: 2, elapsedMs: 3000 });

    // External search: cost from its own record.
    const external = (await db.query<any>(`insert into external_sourcing_runs(company_workspace_id, role_id, status)
      values ($1, $2, 'queued') returning id`, [workspace, role])).rows[0].id;
    await db.query(`update external_sourcing_runs set status = 'succeeded', cost = '{"llmUsd":0.6,"searchUsd":0.2,"totalUsdPaid":0.8}'
      where id = $1`, [external]);
    assert.deepEqual((await operation("external_sourcing_runs", external)).usage,
      { costUsd: 0.8, costComplete: true, llmUsd: 0.6, searchUsd: 0.2 });

    // Usage per kind for the company, with company Harper's own calls from the run ledger.
    await db.query(`update company_agent_web_action_jobs set usage = '{"costUsd":0.05,"costComplete":true,"inputTokens":300,"outputTokens":40}'`);
    const totals = (await db.query<any>("select * from company_agent_usage_v1($1, '2000-01-01', '2100-01-01')", [workspace])).rows;
    const byKind = Object.fromEntries(totals.map((row: any) => [row.kind, row]));
    assert.equal(Number(byKind.member_search.runs), 3);
    assert.equal(Number(byKind.member_search.cost_usd), 0.35);
    assert.equal(Number(byKind.member_search.runs_with_complete_cost), 1);
    assert.equal(Number(byKind.external_search.cost_usd), 0.8);
    assert.equal(Number(byKind.harper_turn.cost_usd), 0.05);
    assert.equal(Number(byKind.harper_turn.output_tokens), 40);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    assert.equal(await can("has_table_privilege('service_role', 'company_agent_operations', 'SELECT')"), true);
    assert.equal(await can("has_table_privilege('service_role', 'company_agent_operations', 'INSERT')"), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_agent_operations', 'SELECT')"), false);
    assert.equal(await can("has_function_privilege('service_role', 'company_agent_usage_v1(uuid,timestamptz,timestamptz)', 'EXECUTE')"), true);
    assert.equal(await can("has_function_privilege('authenticated', 'company_agent_usage_v1(uuid,timestamptz,timestamptz)', 'EXECUTE')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_agent_operations')"), true);
  } finally { await db.close(); }
});
