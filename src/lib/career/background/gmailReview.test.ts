import assert from "node:assert/strict";
import test from "node:test";
import { isWaitingGmailReview } from "./gmailReview";

test("only a Gmail inbox review that has not started is waiting", () => {
  assert.equal(isWaitingGmailReview({ trigger: "gmail_connected", coverage: {} }), true);
  assert.equal(isWaitingGmailReview({ trigger: "gmail_connected", coverage: null }), true);
  assert.equal(isWaitingGmailReview({ trigger: "gmail_connected", coverage: { gmailReviewStartedAt: "2026-11-23T05:00:00Z" } }), false);
  assert.equal(isWaitingGmailReview({ trigger: "career_schedule_due", coverage: {} }), false);
});
