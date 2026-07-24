import assert from "node:assert/strict";
import test from "node:test";
import {
  getInternalOpportunityDecisionAvailability,
  INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH,
  normalizeInternalOpportunityDecisionReason,
} from "./internalOpportunityDecision";

const NOW = Date.parse("2026-07-24T12:00:00.000Z");

const buildState = (
  overrides: Partial<
    Parameters<typeof getInternalOpportunityDecisionAvailability>[0]
  > = {}
): Parameters<typeof getInternalOpportunityDecisionAvailability>[0] => ({
  feedback: "positive",
  feedbackAt: "2026-07-23T12:00:01.000Z",
  internalProgress: null,
  isInternal: true,
  savedStage: "connected",
  sourceType: "internal",
  status: "active",
  ...overrides,
});

test("allows acceptance reversal only before the exact 24-hour boundary", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(buildState(), NOW),
    { canRevert: true, canStopProcess: true }
  );
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({ feedbackAt: "2026-07-23T12:00:00.000Z" }),
      NOW
    ),
    { canRevert: false, canStopProcess: true }
  );
});

test("blocks acceptance reversal after a post-acceptance stage starts", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({
        internalProgress: {
          acceptedAt: "2026-07-23T12:00:01.000Z",
          stage: "pending_connection",
        },
      }),
      NOW
    ),
    { canRevert: false, canStopProcess: true }
  );
});

test("does not infer the reversal window when the acceptance timestamp is missing", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({
        feedbackAt: null,
        internalProgress: {
          acceptedAt: "2026-07-24T11:59:00.000Z",
          stage: "accepted",
        },
      }),
      NOW
    ),
    { canRevert: false, canStopProcess: true }
  );
});

test("treats a connected role as a post-acceptance stage", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({
        internalProgress: {
          acceptedAt: "2026-07-23T12:00:01.000Z",
          stage: "connected",
        },
      }),
      NOW
    ),
    { canRevert: false, canStopProcess: true }
  );
});

test("allows rejection reversal only while the role is not ended", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({ feedback: "negative", status: "active" }),
      NOW
    ),
    { canRevert: true, canStopProcess: false }
  );
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({ feedback: "negative", status: "ENDED" }),
      NOW
    ),
    { canRevert: false, canStopProcess: false }
  );
});

test("keeps the stop action available regardless of internal progress stage", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({
        internalProgress: {
          acceptedAt: "2026-07-23T12:00:01.000Z",
          stage: "process_stopped",
        },
      }),
      NOW
    ),
    { canRevert: false, canStopProcess: true }
  );
});

test("does not offer actions when an accepted recommendation is already closed", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({
        internalProgress: null,
        savedStage: "closed",
      }),
      NOW
    ),
    { canRevert: false, canStopProcess: false }
  );
});

test("does not expose internal decision actions for external roles", () => {
  assert.deepEqual(
    getInternalOpportunityDecisionAvailability(
      buildState({ isInternal: false, sourceType: "external" }),
      NOW
    ),
    { canRevert: false, canStopProcess: false }
  );
});

test("normalizes an optional internal decision reason", () => {
  assert.equal(
    normalizeInternalOpportunityDecisionReason(
      "  다른 회사의 오퍼를 수락했습니다.  "
    ),
    "다른 회사의 오퍼를 수락했습니다."
  );
  assert.equal(normalizeInternalOpportunityDecisionReason("   "), null);
  assert.equal(normalizeInternalOpportunityDecisionReason(null), null);
  assert.equal(
    normalizeInternalOpportunityDecisionReason(
      "a".repeat(INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH + 20)
    )?.length,
    INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH
  );
});
