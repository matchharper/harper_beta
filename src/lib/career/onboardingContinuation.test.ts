import assert from "node:assert/strict";
import test from "node:test";
import { scheduleOnboardingContinuation, deliverContinuationResponse } from "./onboardingContinuation.server";

test("onboarding publishes to the owning chat only after response finalization, with stable retry identity", async () => {
  const callbacks: Array<() => Promise<void>> = [], jobs: unknown[] = [];
  const dependencies = { schedule: (fn: () => Promise<void>) => { callbacks.push(fn); }, publish: async (job: unknown) => { jobs.push(job); } };
  const run: any = { id: "run", talent_id: "owner", conversation_id: "original-chat", status: "handed_off", trigger_payload: { agentInvocation: { replyId: "background:run" } } };
  scheduleOnboardingContinuation(run, dependencies);
  scheduleOnboardingContinuation(run, dependencies);
  assert.equal(jobs.length, 0);
  await callbacks[0](); await callbacks[1]();
  assert.deepEqual(jobs, Array(2).fill({ userId: "owner", conversationId: "original-chat", replyId: "background:run", backgroundRunId: "run", checkpointKey: "accepted:run" }));
  for (const status of ["queued", "running", "completed", "cancelled", "failed"]) scheduleOnboardingContinuation({ ...run, status }, dependencies);
  assert.equal(callbacks.length, 2, "do not steal legacy Worker runs or restart finished work");
});

test("publication failures stay visible while the accepted receipt remains available for recovery", async () => {
  let callback!: () => Promise<void>;
  const run: any = { id: "run", talent_id: "owner", conversation_id: "chat", status: "handed_off", trigger_payload: { agentInvocation: { replyId: "background:run" } } };
  scheduleOnboardingContinuation(run, { schedule: fn => { callback = fn; }, publish: async () => { throw Error("queue unavailable"); } });
  await assert.rejects(callback(), /queue unavailable/);
  assert.equal(run.status, "handed_off");
});


test("ordinary final text is sent verbatim to this chat and failed delivery is not acknowledged", async () => {
  const calls: unknown[] = [];
  const text = "Cedar 백엔드 엔지니어 기회를 저장했어요. 회사에 공유하지 않았습니다.";
  await deliverContinuationResponse(text, async call => { calls.push(call); return { status: "saved" }; });
  assert.deepEqual(calls, [{ name: "contact_user", input: { channel: "chat", body: text } }]);
  await deliverContinuationResponse("", async () => { throw Error("empty reply must not create a message"); });
  await assert.rejects(deliverContinuationResponse(text, async () => { throw Error("delivery failed"); }), /delivery failed/);
});
