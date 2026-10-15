import test from "node:test";
import assert from "node:assert/strict";
import { evaluateContactLifecycle, fixtureRoleName, evaluationExecutionComplete, assertContactEvaluationStep, contactEvaluationSteps, companyEvaluationTurn, companyEvaluationRoleRead } from "./companyAgentEvaluationContract";

const clock = "2026-09-25T06:00:00.000Z";
test("requested Role fields are complete even when empty, and unrequested pipeline data stays absent", () => {
  const role = { name: "Synthetic", request: "known brief", criteria: [], description: null };
  const result = companyEvaluationRoleRead({ role, include: ["description"], pipeline: { people: { items: ["must not leak"] } } });
  assert.equal(result.fieldCompleteness.role_description.included, true);
  assert.equal(result.fieldCompleteness.role_description.complete, true);
  assert.equal(result.role.description, null);
  assert.equal(Object.hasOwn(result.role, "request"), false);
  assert.equal(Object.hasOwn(result, "people"), false);
});
test("Role fixture includes only the explicitly requested complete sources", () => {
  const result = companyEvaluationRoleRead({ role: { name: "Synthetic", request: "known brief", memory: "saved note" }, include: ["criteria", "memory", "pipeline"], pipeline: { countsComplete: true, people: { items: [] } } });
  assert.equal(result.role.request, "known brief");
  assert.deepEqual(result.role.criteria, []);
  assert.deepEqual(result.memory, { content: "saved note", exists: true });
  assert.equal(result.fieldCompleteness.role_description.included, false);
  assert.equal(result.countsComplete, true);
});
test("an event opening never replaces the subsequent company's actual instruction", () => {
  for (const key of ["companyUpdate", "contactEvent"]) {
    const input = { turns: ["event anchor", "Mina에게 그 질문을 보내줘"], [key]: { facts: {} }, allowSilentCompletion: true };
    assert.equal(companyEvaluationTurn(input, 0).origin, "product_event");
    const followup = companyEvaluationTurn(input, 1);
    assert.equal(followup.origin, "company");
    assert.equal(followup.message, input.turns[1]);
    assert.equal(followup.allowSilentCompletion, false);
    assert.equal(followup.recordCompanyMessage, true);
  }
});
test("a scheduled review remains a hidden trigger and does not invent company authority", () => {
  const input = { turns: [{ origin: "scheduled_review", awareness: { lastSentAt: clock } }, "아직 보내지 말고 기다려줘"] };
  const review = companyEvaluationTurn(input, 0);
  assert.equal(review.origin, "scheduled_review");
  assert.equal(review.allowSilentCompletion, true);
  assert.equal(review.recordCompanyMessage, false);
  assert.equal(companyEvaluationTurn(input, 1).recordCompanyMessage, true);
  assert.throws(() => companyEvaluationTurn({ turns: [{ origin: "company", awareness: {} }] }, 0));
});
test("legacy explicit silent-event fixtures do not become company messages", () => {
  const input = { turns: ["legacy event input", "회사 답변"], allowSilentCompletion: true };
  assert.equal(companyEvaluationTurn(input, 0).recordCompanyMessage, false);
  assert.equal(companyEvaluationTurn(input, 1).origin, "company");
  assert.equal(companyEvaluationTurn(input, 1).allowSilentCompletion, false);
});
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
