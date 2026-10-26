import assert from "node:assert/strict";
import test from "node:test";
import { supabase } from "./supabase";
import { fetchWithInternalAuth } from "./internalApiClient";
import { isOrgQueryBlockingError } from "./org/queryError";

test("missing login session blocks a cached org snapshot without making a request", async (t) => {
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: null },
    error: null,
  }));
  t.mock.method(supabase.auth, "refreshSession", async () => ({
    data: { session: null },
    error: null,
  }));
  const request = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected request");
  });
  await assert.rejects(
    fetchWithInternalAuth("/api/org/bootstrap"),
    (error: unknown) => {
      assert.equal((error as { status: number }).status, 401);
      assert.equal(isOrgQueryBlockingError(error, { workspace: {} }), true);
      return true;
    }
  );
  assert.equal(request.mock.callCount(), 0);
});
