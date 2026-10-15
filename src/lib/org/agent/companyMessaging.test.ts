import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyMessages, commitCompanyMessages } from "./companyMessaging";

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
