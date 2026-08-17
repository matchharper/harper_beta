import assert from "node:assert/strict";
import test from "node:test";
import {
  INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS,
  isFreshInternalOpportunityCallRequest,
  isTerminalInternalOpportunityCompanyDecision,
  isTerminalInternalOpportunityCompanyDecisionStage,
} from "./internalOpportunityCallRequestPolicy";

const NOW = Date.parse("2026-08-14T03:00:00.000Z");

test("keeps an internal opportunity call visible only before the exact seven-day boundary", () => {
  assert.equal(
    isFreshInternalOpportunityCallRequest(
      new Date(
        NOW - INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS + 1
      ).toISOString(),
      NOW
    ),
    true
  );
  assert.equal(
    isFreshInternalOpportunityCallRequest(
      new Date(
        NOW - INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS
      ).toISOString(),
      NOW
    ),
    false
  );
  assert.equal(
    isFreshInternalOpportunityCallRequest(
      new Date(
        NOW - INTERNAL_OPPORTUNITY_CALL_REQUEST_MAX_AGE_MS - 1
      ).toISOString(),
      NOW
    ),
    false
  );
  assert.equal(isFreshInternalOpportunityCallRequest("invalid", NOW), false);
});

test("treats only company acceptance and rejection stages as terminal", () => {
  assert.equal(
    isTerminalInternalOpportunityCompanyDecisionStage("connected"),
    true
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecisionStage("process_stopped"),
    true
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecisionStage("accepted"),
    false
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecisionStage("pending_connection"),
    false
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecisionStage("final_offer"),
    false
  );
});

test("treats direct contact and warm intro decisions as terminal across custom stages", () => {
  assert.equal(
    isTerminalInternalOpportunityCompanyDecision({
      contactDirectly: true,
      stage: "custom:stage-1",
    }),
    true
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecision({
      introRequested: true,
      stage: "final_offer",
    }),
    true
  );
  assert.equal(
    isTerminalInternalOpportunityCompanyDecision({ stage: "accepted" }),
    false
  );
});
