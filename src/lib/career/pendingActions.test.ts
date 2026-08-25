import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCareerPendingActionReference } from "./pendingActions";

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
