import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContactLifecycle, fixtureRoleName, evaluationExecutionComplete, assertContactEvaluationStep, contactEvaluationSteps } from "./companyAgentEvaluationContract";

const clock = "2026-09-25T06:00:00.000Z";
test("frozen dialogue protocol prevents final acknowledgement before the candidate's opening", () => {
  const input = { candidateFirst: "frozen opening" };
  assert.throws(() => assertContactEvaluationStep(input, [], "candidate"));
  const steps = contactEvaluationSteps(input);
  steps.forEach((step, index) => assert.doesNotThrow(() => assertContactEvaluationStep(input, steps.slice(0, index), step)));
  assert.throws(() => assertContactEvaluationStep(input, steps, "candidate"));
  assert.throws(() => assertContactEvaluationStep(input, ["company"], "event"));
  assert.doesNotThrow(() => assertContactEvaluationStep({}, [], "company"));
  assert.throws(() => assertContactEvaluationStep({}, ["company"], "candidate"));
});
test("execution gate rejects errors, incomplete turns and empty runs without judging prose", () => {
  const complete = { error: null, turns: 2, expectedTurns: 2 };
  assert.equal(evaluationExecutionComplete([complete]), true);
  assert.equal(evaluationExecutionComplete([]), false);
  assert.equal(evaluationExecutionComplete([{ ...complete, error: "provider timeout" }]), false);
  assert.equal(evaluationExecutionComplete([{ ...complete, turns: 1 }]), false);
  assert.equal(evaluationExecutionComplete([{ error: null, turns: 0, expectedTurns: 0 }]), false);
});
test("standard and immediate approval follow the frozen clock and exact revision", () => {
  for (const [mode, expected] of [["standard", "2026-09-25T06:05:00.000Z"], ["immediate", clock]]) {
    const record = { status: "draft", revision: 3 };
    assert.throws(() => evaluateContactLifecycle(record, { action: "schedule", expectedRevision: 2 }, clock));
    const result = evaluateContactLifecycle(record, { action: "schedule", expectedRevision: 3, deliveryMode: mode }, clock);
    assert.equal(result.scheduledAt, expected);
    assert.equal(result.candidateMessageSent, false);
    assert.equal(record.status, "queued");
  }
});
test("immediate cannot bypass draft approval or recall delivered mail", () => {
  for (const status of ["draft", "sent", "cancelled"]) {
    assert.throws(() => evaluateContactLifecycle({ status }, { action: "immediate" }, clock));
  }
  assert.throws(() => evaluateContactLifecycle({ status: "sent" }, { action: "cancel" }, clock));
});
test("queued immediate schedule is the production lifecycle alias", () => {
  const record = { status: "queued", revision: 3 };
  assert.equal(evaluateContactLifecycle(record, { action: "schedule", deliveryMode: "immediate" }, clock).status, "immediate");
});
test("explicit cancellation cancels without fabricating delivery", () => {
  const record = { status: "draft", revision: 3 };
  assert.equal(evaluateContactLifecycle(record, { action: "cancel" }, clock).status, "cancelled");
});
test("contact Role labels come from each contact, not the conversation Role", () => {
  assert.equal(fixtureRoleName([{ roleId: "a", name: "Backend" }, { roleId: "b", name: "Payments" }], "b"), "Payments");
  assert.throws(() => fixtureRoleName([], "unknown"));
});
