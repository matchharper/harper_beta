import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// #261 follow-up: searches are linked to the company Harper run that started
// them (external searches through their own row, member searches queued by an
// RPC right after), existing searches are linked where their record says
// which run asked, and turns outside the run ledger get their usage.
const SETUP = `
  create role anon; create role authenticated; create role service_role;
  create table company_workspace(company_workspace_id uuid primary key);
  create table company_roles(role_id uuid primary key, company_workspace_id uuid);
  create table company_agent_web_action_jobs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    action_name text, status text, anchor_message_id bigint unique, action_context jsonb default '{}',
    created_at timestamptz default now());
  create table company_first_search_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, status text, request_options jsonb default '{}', model_manifest jsonb, result jsonb,
    scheduled_slot timestamptz, heartbeat_at timestamptz, started_at timestamptz, finished_at timestamptz,
    created_at timestamptz default now());
  create table external_sourcing_runs(id uuid primary key default gen_random_uuid(), company_workspace_id uuid,
    role_id uuid, status text, input jsonb not null default '{}', cost jsonb, heartbeat_at timestamptz,
    started_at timestamptz, finished_at timestamptz, created_at timestamptz default now());
`;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W1, W2, R1, R2] = [id(1), id(2), id(11), id(12)];
const [J1, J2, KICKOFF, JOINED] = [id(21), id(22), id(23), id(24)];
const [TOOL, CHAT, CROSS, KICKED, MERGED, OLD_EXTERNAL] = [id(31), id(32), id(33), id(34), id(35), id(36)];

const migration = (name: string) =>
  readFile(new URL(`../../../supabase/migrations/${name}`, import.meta.url), "utf8");

test("searches are linked to the run that started them; turns outside the run ledger get usage", async () => {
  const db = new PGlite();
  try {
    await db.exec(SETUP);
    await db.exec(`
      insert into company_workspace values ('${W1}'), ('${W2}');
      insert into company_roles values ('${R1}', '${W1}'), ('${R2}', '${W2}');
      insert into company_agent_web_action_jobs(id, company_workspace_id, action_name, status, anchor_message_id, action_context) values
        ('${J1}', '${W1}', 'company_update', 'completed_message', 101, '{}'),
        ('${J2}', '${W2}', 'company_update', 'completed_message', 202, '{}'),
        ('${KICKOFF}', '${W1}', 'role_search_kickoff', 'completed_message', 301,
          '{"matchingSearchResult":{"status":"queued","runId":"${KICKED}"}}'),
        ('${JOINED}', '${W1}', 'role_search_kickoff', 'completed_message', 302,
          '{"matchingSearchResult":{"status":"already_queued","runId":"${MERGED}"}}');
      -- Searches made before the ledger knew their runs.
      insert into company_first_search_runs(id, company_workspace_id, role_id, status, request_options) values
        ('${TOOL}', '${W1}', '${R1}', 'succeeded', '{"sourceMessageId":101}'),
        ('${CHAT}', '${W1}', '${R1}', 'succeeded', '{"sourceMessageId":999}'),
        ('${CROSS}', '${W1}', '${R1}', 'succeeded', '{"sourceMessageId":202}'),
        ('${KICKED}', '${W1}', null, 'succeeded', '{}'),
        ('${MERGED}', '${W1}', null, 'succeeded', '{}');
      insert into external_sourcing_runs(id, company_workspace_id, role_id, status) values
        ('${OLD_EXTERNAL}', '${W1}', '${R1}', 'succeeded');
    `);
    await db.exec(await migration("20261105190000_company_agent_operations.sql"));
    await db.exec(await migration("20261107011000_company_agent_run_records.sql"));

    const runOf = async (kind: string, work: string) => (await db.query<{ run_id: string | null }>(
      "select run_id from company_agent_operations where kind = $1 and work_id = $2", [kind, work])).rows[0]?.run_id;

    // Existing searches: linked where the record names the run, never across companies.
    assert.equal(await runOf("member_search", TOOL), J1, "Harper's tool stored the run's anchor");
    assert.equal(await runOf("member_search", CHAT), null, "a chat message is not a run");
    assert.equal(await runOf("member_search", CROSS), null, "another company's run");
    assert.equal(await runOf("member_search", KICKED), KICKOFF, "the search a kickoff queued");
    assert.equal(await runOf("member_search", MERGED), null, "a search a kickoff only joined");
    assert.equal(await runOf("external_search", OLD_EXTERNAL), null);

    // New external searches carry their run in input.
    const external = async (input: unknown) => (await db.query<{ id: string }>(
      `insert into external_sourcing_runs(company_workspace_id, role_id, status, input) values ($1, $2, 'queued', $3)
       returning id`, [W1, R1, JSON.stringify(input)])).rows[0]!.id;
    assert.equal(await runOf("external_search", await external({ reason: "r", webActionJobId: J1 })), J1);
    assert.equal(await runOf("external_search", await external({ webActionJobId: J2 })), null);
    assert.equal(await runOf("external_search", await external({ webActionJobId: "not-a-uuid" })), null);
    assert.equal(await runOf("external_search", await external({ reason: "chat" })), null);

    // Scheduled member searches still follow their root run, of the same company only.
    const member = async (options: unknown) => (await db.query<{ id: string }>(
      `insert into company_first_search_runs(company_workspace_id, role_id, status, request_options)
       values ($1, $2, 'queued', $3) returning id`, [W1, R1, JSON.stringify(options)])).rows[0]!.id;
    assert.equal(await runOf("member_search", await member({ rootJobId: J1 })), J1);
    assert.equal(await runOf("member_search", await member({ rootJobId: J2 })), null);

    // A member search queued through an RPC is linked once, to a run of its company.
    const queued = await member({ requestId: "call-1" });
    const link = async (kind: string, work: string, run: string) => (await db.query<{ linked: boolean }>(
      "select link_company_agent_operation_run_v1($1, $2, $3) as linked", [kind, work, run])).rows[0]!.linked;
    assert.equal(await link("member_search", queued, J2), false, "another company's run");
    assert.equal(await link("external_search", queued, J1), false, "another kind");
    assert.equal(await runOf("member_search", queued), null);
    assert.equal(await link("member_search", queued, J1), true);
    assert.equal(await link("member_search", queued, KICKOFF), false, "already linked");
    assert.equal(await runOf("member_search", queued), J1);

    // Turn usage: one row per turn; later parts of the same turn add up.
    const record = (kind: string, source: string, workspace: string, role: string | null, usage: unknown) =>
      db.query("select record_company_agent_turn_usage_v1($1, $2, $3, $4, $5)",
        [kind, source, workspace, role, JSON.stringify(usage)]);
    const part = (extra: Record<string, unknown> = {}) => ({ cacheWriteTokens: 0, cachedInputTokens: 5, calls: 1,
      costComplete: true, costUsd: 0.01, elapsedMs: 100, inputTokens: 100, models: ["m1"], outputTokens: 10, ...extra });
    await record("slack_turn", "slack-job-1", W1, R1, part());
    await record("slack_turn", "slack-job-1", W1, R1, part({ costUsd: 0.02, calls: 2 }));
    await record("slack_turn", "slack-job-1", W1, R1, part({ costComplete: false, models: ["m2", "m1"] }));
    // The same turn named with another company changes nothing.
    await record("slack_turn", "slack-job-1", W2, null, part({ costUsd: 9 }));
    const turn = async (kind: string, source: string) => (await db.query<any>(
      "select * from company_agent_turn_usage where kind = $1 and source_id = $2", [kind, source])).rows[0];
    const slack = await turn("slack_turn", "slack-job-1");
    assert.equal(slack.company_workspace_id, W1);
    assert.equal(slack.role_id, R1);
    assert.deepEqual(slack.usage, { cacheWriteTokens: 0, cachedInputTokens: 15, calls: 4, costComplete: false,
      costUsd: 0.04, elapsedMs: 300, inputTokens: 300, models: ["m1", "m2"], outputTokens: 30, attempts: 3 });
    // A Role of another company is not kept.
    await record("email_reply", "mail-job-1", W1, R2, part({ costUsd: 0.5 }));
    assert.equal((await turn("email_reply", "mail-job-1")).role_id, null);
    assert.equal((await turn("email_reply", "mail-job-1")).usage.attempts, 1);
    await record("connection_email", "outbox-1", W1, null, part({ costUsd: 0.25, outputTokens: 40 }));
    for (const bad of [["guess", "x", W1], ["slack_turn", " ", W1], ["slack_turn", "x", null]] as const) {
      await assert.rejects(record(bad[0], bad[1], bad[2] as string, null, part()), /invalid_company_turn_usage/);
    }
    await assert.rejects(record("slack_turn", "slack-job-2", W1, null, ["not an object"]), /invalid_company_turn_usage/);

    // Usage per kind now includes the turns outside the run ledger.
    await db.query("update company_agent_web_action_jobs set usage = '{\"costUsd\":0.05,\"costComplete\":true}' where id = $1", [J1]);
    const totals = (await db.query<any>("select * from company_agent_usage_v1($1, '2000-01-01', '2100-01-01')", [W1])).rows;
    const byKind = Object.fromEntries(totals.map((row: any) => [row.kind, row]));
    assert.deepEqual(Object.keys(byKind).sort(),
      ["connection_email", "email_reply", "external_search", "harper_turn", "member_search", "slack_turn"]);
    assert.equal(Number(byKind.slack_turn.runs), 1);
    assert.equal(Number(byKind.slack_turn.cost_usd), 0.04);
    assert.equal(Number(byKind.slack_turn.runs_with_complete_cost), 0);
    assert.equal(Number(byKind.slack_turn.input_tokens), 300);
    assert.equal(Number(byKind.email_reply.cost_usd), 0.5);
    assert.equal(Number(byKind.email_reply.runs_with_complete_cost), 1);
    assert.equal(Number(byKind.connection_email.output_tokens), 40);
    assert.equal(Number(byKind.harper_turn.cost_usd), 0.05);
    assert.equal((await db.query<any>("select * from company_agent_usage_v1($1, '2000-01-01', '2100-01-01')", [W2]))
      .rows.some((row: any) => row.kind === "slack_turn"), false);

    // The migration runs again without changes.
    await db.exec(await migration("20261107011000_company_agent_run_records.sql"));
    assert.equal((await turn("slack_turn", "slack-job-1")).usage.attempts, 3);
    assert.equal(await runOf("member_search", TOOL), J1);

    const can = async (q: string) => (await db.query<any>(`select ${q} as ok`)).rows[0].ok;
    for (const fn of ["link_company_agent_operation_run_v1(text,uuid,uuid)",
      "record_company_agent_turn_usage_v1(text,text,uuid,uuid,jsonb)", "company_agent_usage_v1(uuid,timestamptz,timestamptz)"]) {
      assert.equal(await can(`has_function_privilege('service_role', '${fn}', 'EXECUTE')`), true, fn);
      assert.equal(await can(`has_function_privilege('authenticated', '${fn}', 'EXECUTE')`), false, fn);
      assert.equal(await can(`has_function_privilege('anon', '${fn}', 'EXECUTE')`), false, fn);
    }
    assert.equal(await can("has_table_privilege('service_role', 'company_agent_turn_usage', 'SELECT')"), true);
    assert.equal(await can("has_table_privilege('service_role', 'company_agent_turn_usage', 'INSERT')"), false);
    assert.equal(await can("has_table_privilege('authenticated', 'company_agent_turn_usage', 'SELECT')"), false);
    assert.equal(await can("(select relrowsecurity from pg_class where relname = 'company_agent_turn_usage')"), true);
  } finally { await db.close(); }
});
