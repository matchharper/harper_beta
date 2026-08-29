import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCareerOpenablePendingActionReference,
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
      id: "schedule_123",
      kind: "meeting_schedule",
    }),
    null
  );
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

test("normalizes meeting schedules only as openable pending actions", () => {
  assert.deepEqual(
    normalizeCareerOpenablePendingActionReference({
      id: "schedule_123",
      kind: "meeting_schedule",
    }),
    { id: "schedule_123", kind: "meeting_schedule" }
  );
});

test("selects at most one re-engagement action", () => {
  const actions: CareerReengagementPendingAction[] = [
    {
      actionKey: "pending_1",
      kind: "reevaluation_question",
      question: "영어 협업 경험이 있으신가요?",
    },
    {
      actionKey: "pending_2",
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
