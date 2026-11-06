import assert from "node:assert/strict";
import test from "node:test";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { addLlmCallToRunUsage, createCompanyRunUsage } from "@/lib/llm/runUsage";
import {
  currentCompanyRunId,
  linkOperationToRun,
  withCompanyTurnUsage,
  type CompanyTurnUsageRecorder,
} from "./runRecords.server";

const RUN = "20000000-0000-4000-8000-000000000001";
const response = { usage: { prompt_tokens: 1000, completion_tokens: 200 } };

function quietWarnings(t: { after: (fn: () => void) => void }) {
  const warn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  t.after(() => { console.warn = warn; });
  return warnings;
}

test("the run id reaches everything inside a run, nested usage contexts included", async () => {
  assert.equal(currentCompanyRunId(), null);
  await withLlmUsageContext({ requestId: RUN, companyRunId: RUN, companyRunUsage: createCompanyRunUsage() }, async () => {
    assert.equal(currentCompanyRunId(), RUN);
    await withLlmUsageContext({ requestId: "nested" }, async () => assert.equal(currentCompanyRunId(), RUN));
  });
});

test("a queued search is linked to the current run once; outside a run nothing is called", async (t) => {
  const warnings = quietWarnings(t);
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const admin = { rpc: async (name: string, params: Record<string, unknown>) => {
    calls.push({ name, params });
    return { data: true, error: null };
  } };
  assert.equal(await linkOperationToRun({ admin, kind: "member_search", workId: "search-1" }), false);
  assert.equal(calls.length, 0);
  await withLlmUsageContext({ requestId: RUN, companyRunId: RUN }, async () => {
    assert.equal(await linkOperationToRun({ admin, kind: "member_search", workId: "search-1" }), true);
    // No search id (not queued): nothing to link.
    assert.equal(await linkOperationToRun({ admin, kind: "member_search", workId: undefined }), false);
  });
  assert.deepEqual(calls, [{ name: "link_company_agent_operation_run_v1",
    params: { p_kind: "member_search", p_work_id: "search-1", p_run_id: RUN } }]);
  // An explicit run (the kickoff passes its own job) needs no context.
  assert.equal(await linkOperationToRun({ admin, kind: "member_search", workId: "search-2", runId: "kickoff" }), true);
  assert.equal(calls[1]!.params.p_run_id, "kickoff");
  // The search is already queued: a failed link is only logged.
  const failing = { rpc: async () => ({ data: null, error: { message: "missing function" } }) };
  assert.equal(await linkOperationToRun({ admin: failing, kind: "member_search", workId: "s", runId: RUN }), false);
  const thrown = { rpc: async () => { throw new Error("network"); } };
  assert.equal(await linkOperationToRun({ admin: thrown, kind: "member_search", workId: "s", runId: RUN }), false);
  assert.equal(warnings.length, 2);
});

test("a turn's model calls are saved once when it ends, also when it fails", async (t) => {
  const warnings = quietWarnings(t);
  const saved: Array<Parameters<CompanyTurnUsageRecorder>> = [];
  const record: CompanyTurnUsageRecorder = async (...args) => { saved.push(args); };

  const result = await withCompanyTurnUsage({ kind: "email_reply", sourceId: "mail-job", workspaceId: "ws" }, async () => {
    await addLlmCallToRunUsage("gpt-6-luna", response);
    await addLlmCallToRunUsage("typesafe/jev-1.13", response, { providerCostUsd: 0.002 });
    return "reply";
  }, record);
  assert.equal(result, "reply");
  assert.equal(saved.length, 1);
  const [target, usage] = saved[0]!;
  assert.deepEqual(target, { kind: "email_reply", sourceId: "mail-job", workspaceId: "ws" });
  assert.equal(usage.calls, 2);
  assert.equal(usage.inputTokens, 2000);
  assert.equal(usage.outputTokens, 400);
  // The provider's own cost is used for the call that reports it, so the cost is complete.
  assert.equal(usage.costComplete, true);
  assert.ok(usage.costUsd > 0.002);
  assert.deepEqual(usage.models, ["gpt-6-luna", "typesafe/jev-1.13"]);

  // The workspace is known only once the turn has read it (Slack); a failure still saves.
  const slack = { kind: "slack_turn" as const, sourceId: "slack-job", workspaceId: null as string | null, roleId: null as string | null };
  await assert.rejects(withCompanyTurnUsage(slack, async () => {
    slack.workspaceId = "ws"; slack.roleId = "role";
    await addLlmCallToRunUsage("unknown-model-x", response);
    throw new Error("delivery failed");
  }, record), /delivery failed/);
  assert.equal(saved.length, 2);
  assert.equal(saved[1]![0].roleId, "role");
  assert.equal(saved[1]![1].costComplete, false, "an unpriced model leaves the cost incomplete");

  // No model call, or no company yet: nothing is saved.
  await withCompanyTurnUsage({ kind: "connection_email", sourceId: "outbox", workspaceId: "ws" }, async () => "draft", record);
  await withCompanyTurnUsage({ kind: "slack_turn", sourceId: "early", workspaceId: null }, async () => {
    await addLlmCallToRunUsage("gpt-6-luna", response);
  }, record);
  assert.equal(saved.length, 2);

  // Saving is best effort: the turn's own result stands.
  const broken: CompanyTurnUsageRecorder = async () => { throw new Error("database down"); };
  assert.equal(await withCompanyTurnUsage({ kind: "email_reply", sourceId: "m", workspaceId: "ws" }, async () => {
    await addLlmCallToRunUsage("gpt-6-luna", response);
    return "sent";
  }, broken), "sent");
  assert.equal(warnings.length, 1);

  // A turn's calls never leak into an outer run's totals, nor the reverse.
  const runTotals = createCompanyRunUsage();
  await withLlmUsageContext({ requestId: RUN, companyRunId: RUN, companyRunUsage: runTotals }, async () => {
    await addLlmCallToRunUsage("gpt-6-luna", response);
    await withCompanyTurnUsage({ kind: "email_reply", sourceId: "inner", workspaceId: "ws" }, async () => {
      await addLlmCallToRunUsage("gpt-6-luna", response);
    }, record);
  });
  assert.equal(runTotals.calls, 1);
  assert.equal(saved.at(-1)![1].calls, 1);
});
