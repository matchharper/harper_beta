import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCareerPendingActionReference,
  selectCareerReengagementPromptActions,
  type CareerReengagementPendingAction,
} from "./pendingActions";

test("normalizes supported composer pending action references", () => {
  assert.deepEqual(
    normalizeCareerPendingActionReference({
      id: "request_123",
      kind: "company_request",
    }),
    { id: "request_123", kind: "company_request" }
  );
  assert.deepEqual(
    normalizeCareerPendingActionReference({
      id: "recommendation:456",
      kind: "internal_opportunity",
    }),
    { id: "recommendation:456", kind: "internal_opportunity" }
  );
});

test("rejects call references and malformed ids from chat requests", () => {
  assert.equal(
    normalizeCareerPendingActionReference({
      id: "call_123",
      kind: "internal_opportunity_call",
    }),
    null
  );
  assert.equal(
    normalizeCareerPendingActionReference({
      id: "request id with spaces",
      kind: "company_request",
    }),
    null
  );
});

test("selects at most one re-engagement action", () => {
  const actions: CareerReengagementPendingAction[] = [
    {
      callId: "call-1",
      companyName: "Acme",
      kind: "talent_call",
      reason: null,
      resumePromptNeeded: false,
      roleTitle: "Engineer",
    },
    {
      kind: "reevaluation_question",
      question: "영어 협업 경험이 있으신가요?",
    },
    {
      companyName: "Third Company",
      kind: "internal_opportunity",
      recommendationSummary: null,
      roleTitle: "Product Engineer",
    },
  ];

  assert.deepEqual(selectCareerReengagementPromptActions(actions), [
    actions[0],
  ]);
});
