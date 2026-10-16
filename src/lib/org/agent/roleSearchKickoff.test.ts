import assert from "node:assert/strict";
import test from "node:test";
import { runRoleSearchKickoff, readRoleSearchKickoffExplanation } from "./roleSearchKickoff.server";

test("committed kickoff resumes its original batch without research, Brief writes or another message", async () => {
  const filters: unknown[] = [];
  const query: any = {
    select() { return query; }, eq(...args: unknown[]) { filters.push(args); return query; },
    contains(...args: unknown[]) { filters.push(args); return query; }, not() { return query; },
    order() { return Promise.resolve({ data: [{ id: 21, metadata: { companyMessageBatch: { batchId: "original-batch" } } }], error: null }); },
  };
  let accessChecks = 0;
  const forbidden = async () => { throw Error("Must not restart committed work"); };
  const result = await runRoleSearchKickoff({
    user: { id: "actor" } as any, conversation: { id: "conversation", company_workspace_id: "workspace", role_id: "role" } as any,
    roleId: "role", jobId: "job", anchorMessageId: 20, actionContext: { channelDbId: "channel" },
  }, {
    admin: () => ({ from(table: string) { assert.equal(table, "company_messages"); return query; } }) as any,
    access: async () => { accessChecks++; return { id: "channel", slack_channel_id: "C1", is_enabled: true }; },
    context: forbidden, research: forbidden, saveLogs: forbidden,
  });
  assert.equal(accessChecks, 1);
  assert.deepEqual(result, { outcome: "completed_message", progressMessageId: null, terminalMessageId: 21, batchId: "original-batch" });
  assert.ok(filters.some(f => JSON.stringify(f) === JSON.stringify(["metadata", { webActionJobId: "job" }])));
});

test("ordinary result writer receives only the delivered explanation for the exact run and Role", async () => {
  const calls: unknown[] = [];
  const admin: any = { from(table: string) {
    const query: any = { select() { return query; },
      eq(...args: unknown[]) { calls.push([table, ...args]); return query; },
      contains(...args: unknown[]) { calls.push([table, ...args]); return query; },
      not(...args: unknown[]) { calls.push([table, ...args]); return query; },
      order() { return table === "company_messages" ? Promise.resolve({ data: [{ content: "서치 방향" }, { content: "전달된 설명" }], error: null }) : query; },
      limit() { return query; }, maybeSingle() { return Promise.resolve({ data: { id: "job" }, error: null }); },
    }; return query;
  } };
  const result = await readRoleSearchKickoffExplanation({ admin, workspaceId: "workspace", roleId: "role", runId: "run" });
  assert.deepEqual(result, { alreadyDelivered: true, explanation: "서치 방향\n\n전달된 설명" });
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(["company_agent_web_action_jobs", "action_context", { matchingSearchResult: { runId: "run" } }])));
  assert.ok(calls.some(c => JSON.stringify(c) === JSON.stringify(["company_messages", "metadata->companyMessageReceipt", "is", null])));
});

test("a newer company turn supersedes uncommitted research before its next tool", async () => {
  const admin: any = { from(table: string) {
    const query: any = { select() { return query; }, eq() { return query; }, contains() { return query; },
      not() { return query; }, in() { return query; }, gt() { return query; },
      order() { return Promise.resolve({ data: [], error: null }); },
      limit() { return Promise.resolve({ data: [{ id: 22 }], error: null }); },
      single() { assert.equal(table, "company_agent_web_action_jobs"); return Promise.resolve({ data: { status: "processing" }, error: null }); },
    }; return query;
  } };
  await assert.rejects(runRoleSearchKickoff({
    user: { id: "actor" } as any, conversation: { id: "conversation", company_workspace_id: "workspace", role_id: "role" } as any,
    roleId: "role", jobId: "job", anchorMessageId: 20, actionContext: { channelDbId: "channel" },
  }, {
    admin: () => admin,
    access: async () => ({ id: "channel", slack_channel_id: "C1", is_enabled: true }),
    context: async () => ({}) as any,
    research: async args => { await args.assertCanContinue(); throw Error("Must stop before research"); },
    saveLogs: async () => { throw Error("Must not commit a message"); },
  }), { name: "OrgAgentWebActionSupersededError" });
});
