import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyMessages, commitCompanyMessages, saveCompanyMessageBatchThinkingLogs } from "./companyMessaging";
import { upsertOrgAgentThinkingLog } from "./thinkingLogs";
import type { OrgAgentThinkingLog } from "./types";

test("terminal message graph preserves authored text, references and inherited Role", () => {
  const text = "안녕하세요! *채용 검토*를 도와드릴게요.\n• 첫 번째 근거";
  const rows = parseCompanyMessages({ messages: [{ ref: "opening", text }, { ref: "role", text: "Role", roleId: "r1" },
    { ref: "details", text: "Details", replyTo: "role" }] });
  assert.equal(rows[0].text, text);
  assert.equal(rows[2].roleId, "r1");
  assert.equal(rows[2].replyTo, "role");
});
test("invalid graph is rejected before committing any messages", () => {
  for (const messages of [[], [{ ref: "a", text: "x", replyTo: "later" }],
    [{ ref: "a", text: "x" }, { ref: "a", text: "y" }],
    [{ ref: "a", text: "x", roleId: "r1" }, { ref: "b", text: "y", replyTo: "a", roleId: "r2" }],
    [{ ref: "a", text: "x", threadRef: "t", replyTo: "b" }]]) assert.throws(() => parseCompanyMessages({ messages }));
});
test("commit uses the authenticated audience and returns durable identities", async () => {
  let call: any;
  const admin = { async rpc(name: string, args: any) { call = { name, args }; return { data: { batchId: "b", messageIds: [1, 2] } }; } };
  const result = await commitCompanyMessages({ admin, audience: { channelDbId: "approved", channelId: "C1", jobId: "job" },
    actorId: "actor", workspaceId: "workspace", conversationId: "conversation", sourceMessageId: 42, model: "model",
    messages: [{ ref: "a", text: "x" }] });
  assert.deepEqual(result, { batchId: "b", messageIds: [1, 2] });
  assert.equal(call.args.p_channel_id, "approved");
  assert.equal(call.args.p_source_message_id, 42);
  assert.equal(call.args.p_job_id, "job");
});

test("Working logs keep completed tool status on every committed message within the batch scope", async () => {
  let logs: OrgAgentThinkingLog[] = [];
  for (const log of [
    { id: "read", at: "2026-10-15T08:00:00Z", label: "조회 중", status: "running" as const },
    { id: "read", at: "2026-10-15T08:00:01Z", label: "조회 완료", status: "done" as const },
    { id: "history", at: "2026-10-15T08:00:02Z", label: "대화 확인 실패", status: "error" as const },
    { id: "response", at: "2026-10-15T08:00:03Z", label: "응답 생성", status: "running" as const },
  ]) logs = upsertOrgAgentThinkingLog(logs, log);
  const calls: unknown[] = [];
  const query = {
    update(value: unknown) { calls.push(["update", value]); return this; },
    eq(key: string, value: unknown) { calls.push(["eq", key, value]); return this; },
    contains(key: string, value: unknown) { calls.push(["contains", key, value]); return this; },
    async in(key: string, value: unknown) { calls.push(["in", key, value]); return { error: null }; },
  };
  await saveCompanyMessageBatchThinkingLogs({
    admin: { from(table: string) { assert.equal(table, "company_messages"); return query; } },
    workspaceId: "workspace", batch: { batchId: "batch", messageIds: [1, 2, 3] }, thinkingLogs: logs,
  });
  assert.deepEqual(calls, [
    ["update", { thinking_logs: [
      { id: "read", at: "2026-10-15T08:00:00Z", label: "조회 완료", status: "done" },
      { id: "history", at: "2026-10-15T08:00:02Z", label: "대화 확인 실패", status: "error" },
    ] }],
    ["eq", "company_workspace_id", "workspace"], ["eq", "role", "assistant"],
    ["contains", "metadata", { companyMessageBatch: { batchId: "batch" } }],
    ["in", "id", [1, 2, 3]],
  ]);
});

test("silent runs create no log-only messages and empty retries do not erase saved logs", async () => {
  const admin = { from() { assert.fail("No message write expected"); } };
  await saveCompanyMessageBatchThinkingLogs({ admin, workspaceId: "w",
    thinkingLogs: [{ id: "read", at: "now", label: "조회 완료", status: "done" }] });
  await saveCompanyMessageBatchThinkingLogs({ admin, workspaceId: "w",
    batch: { batchId: "b", messageIds: [1] }, thinkingLogs: [] });
});

test("Working log persistence errors are surfaced", async () => {
  const error = new Error("storage unavailable");
  const query = { update() { return this; }, eq() { return this; }, contains() { return this; },
    async in() { return { error }; } };
  await assert.rejects(saveCompanyMessageBatchThinkingLogs({ admin: { from() { return query; } },
    workspaceId: "w", batch: { batchId: "b", messageIds: [1] },
    thinkingLogs: [{ id: "read", at: "now", label: "조회 완료", status: "done" }],
  }), error);
});
