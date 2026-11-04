import assert from "node:assert/strict";
import test from "node:test";
import { AuthRetryableFetchError, type Session } from "@supabase/supabase-js";

test("Realtime preserves user auth on a retryable session read failure and clears it on logout", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:55431";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-anon-key";
  const { supabase } = await import("./supabase");
  await supabase.auth.initialize();
  let session = { access_token: "user-token" } as Session | null;
  let error: AuthRetryableFetchError | null = null;
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session },
    error,
  }));
  await supabase.realtime.setAuth();
  assert.equal(supabase.realtime.accessTokenValue, "user-token");

  session = null;
  error = new AuthRetryableFetchError("Auth temporarily unavailable", 503);
  await supabase.realtime.setAuth();
  assert.equal(
    supabase.realtime.accessTokenValue,
    "user-token",
    "an Auth error must not replace user credentials with the public key"
  );

  error = null;
  await supabase.realtime.setAuth();
  assert.equal(
    supabase.realtime.accessTokenValue,
    null,
    "a successful session read without a session is logout"
  );

  session = { access_token: "next-user-token" } as Session;
  await supabase.realtime.setAuth();
  assert.equal(supabase.realtime.accessTokenValue, "next-user-token");
  await supabase.auth.stopAutoRefresh();
});
