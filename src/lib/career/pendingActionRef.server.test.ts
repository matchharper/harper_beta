import assert from "node:assert/strict";
import test from "node:test";

import {
  createCareerPendingActionRef,
  verifyCareerPendingActionRef,
} from "./pendingActionRef.server";

process.env.CAREER_PENDING_ACTION_TOKEN_SECRET = "pending-action-test-secret";

test("signs and verifies a pending action reference", () => {
  const ref = createCareerPendingActionRef({
    reference: { id: "request_123", kind: "company_request" },
    talentId: "talent_456",
  });

  assert.doesNotMatch(ref, /request_123|company_request|talent_456/);
  const verified = verifyCareerPendingActionRef(ref);
  assert.ok(verified);
  assert.deepEqual(verified.reference, {
    id: "request_123",
    kind: "company_request",
  });
  assert.equal(verified.talentId, "talent_456");
  assert.equal(verified.version, 1);
  assert.ok(verified.exp > Math.floor(Date.now() / 1000));
});

test("rejects tampered and expired pending action references", () => {
  const ref = createCareerPendingActionRef({
    reference: { id: "fit_123", kind: "internal_fit_question" },
    talentId: "talent_456",
  });
  assert.equal(verifyCareerPendingActionRef(`${ref}tampered`), null);

  const expiredRef = createCareerPendingActionRef({
    reference: { id: "fit_123", kind: "internal_fit_question" },
    talentId: "talent_456",
    ttlSeconds: -1,
  });
  assert.equal(verifyCareerPendingActionRef(expiredRef), null);
});

test("signs meeting schedule references without exposing their identifiers", () => {
  const ref = createCareerPendingActionRef({
    reference: { id: "schedule_123", kind: "meeting_schedule" },
    talentId: "talent_456",
  });

  assert.doesNotMatch(ref, /schedule_123|meeting_schedule|talent_456/);
  assert.deepEqual(verifyCareerPendingActionRef(ref)?.reference, {
    id: "schedule_123",
    kind: "meeting_schedule",
  });
});
