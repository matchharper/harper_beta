import assert from "node:assert/strict";
import test from "node:test";
import { deferBusyCareerAgentReply, type CareerAgentReplyJob } from "./agentReplyQueue";
import { CareerAgentReplyUnavailable } from "./agentReplyError";

const job: CareerAgentReplyJob = {
  userId: "user", conversationId: "conversation", sourceMessageId: 123,
  replyId: "message:123", proactiveContext: "The user selected request 42.",
};

test("busy replies publish the saved source with a stable queue identity and original context", async () => {
  const published: CareerAgentReplyJob[] = [];
  const publish = async (value: CareerAgentReplyJob) => { published.push(value); };
  const error = new CareerAgentReplyUnavailable(job.replyId, false);
  assert.equal(await deferBusyCareerAgentReply(error, job, publish), true);
  assert.equal(await deferBusyCareerAgentReply(error, job, publish), true);
  assert.deepEqual(published, [{ ...job, checkpointKey: "initial" }, { ...job, checkpointKey: "initial" }]);
});

test("completed replies, unrelated failures and unsaved requests do not enqueue another execution", async () => {
  const publish = async () => { assert.fail("must not publish"); };
  assert.equal(await deferBusyCareerAgentReply(new CareerAgentReplyUnavailable(job.replyId, true), job, publish), false);
  assert.equal(await deferBusyCareerAgentReply(new Error("Provider failed"), job, publish), false);
  assert.equal(await deferBusyCareerAgentReply(new CareerAgentReplyUnavailable(job.replyId, false), undefined, publish), false);
});

test("a failed publish is not acknowledged as queued", async () => {
  await assert.rejects(deferBusyCareerAgentReply(new CareerAgentReplyUnavailable(job.replyId, false), job,
    async () => { throw new Error("Queue unavailable"); }), /Queue unavailable/);
});
