import assert from "node:assert/strict";
import test from "node:test";
import { dispatchCareerAgentReplies } from "./agentReplyRecovery";
import type { CareerAgentReplyJob } from "./agentReplyQueue";

test("checkpoint recovery advances pages and preserves reply identity after a publish failure", async () => {
  const calls: string[] = [];
  const pages = [
    [{ userId: "user", conversationId: "conversation", checkpoint: {replyId: "A", checkpointId: "saved-A", continuation:{channel:"career",sourceMessageId:123,runtimeInstruction:"Original event",assistantModel:"claude-haiku-5-5"}} }],
    [{ userId: "user", conversationId: "conversation", checkpoint: {replyId: "B", checkpointId: "saved-B", continuation:{channel:"career"}} }],
    [],
  ];
  const admin = { rpc: async (name: string) => {
    if (name === "claim_career_invocations") return { data: [], error: null };
    calls.push(name);
    return { data: pages.shift(), error: null };
  } } as any;
  const published: CareerAgentReplyJob[] = [];
  const result = await dispatchCareerAgentReplies(admin, async job => {
    published.push(job);
    if (job.replyId === "A") throw new Error("Queue temporarily unavailable");
  });
  assert.deepEqual(result, { dispatched: 1, deferred: 1 });
  assert.equal(calls.length, 3);
  assert.deepEqual(published, [
    { userId: "user", conversationId: "conversation", replyId: "A", checkpointKey: "saved-A", sourceMessageId: 123, proactiveContext: "Original event", assistantModel: "claude-haiku-5-5" },
    { userId: "user", conversationId: "conversation", replyId: "B", checkpointKey: "saved-B" },
  ]);
});

test("the cron time budget stops between pages without losing a durable checkpoint", async () => {
  let called = false;
  const admin = { rpc: async () => { called = true; return { data: [], error: null }; } } as any;
  assert.deepEqual(await dispatchCareerAgentReplies(admin, async () => {}, Date.now() - 1), { dispatched: 0, deferred: 0 });
  assert.equal(called, false);
});
