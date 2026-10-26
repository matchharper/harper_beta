import assert from "node:assert/strict";
import test from "node:test";
import { isOrgQueryBlockingError } from "./queryError";

test("a failed refresh keeps a confirmed snapshot, but access loss and first-load failure block it", () => {
  assert.equal(isOrgQueryBlockingError(new Error("offline"), {}), false);
  assert.equal(isOrgQueryBlockingError({ status: 503 }, {}), false);
  assert.equal(isOrgQueryBlockingError(new Error("offline"), undefined), true);
  for (const status of [401, 403, 404]) {
    assert.equal(isOrgQueryBlockingError({ status }, {}), true);
  }
  assert.equal(isOrgQueryBlockingError(null, undefined), false);
});
