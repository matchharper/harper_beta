import assert from "node:assert/strict";
import test from "node:test";
import {
  readCalendarCallback,
  withoutCalendarCallback,
} from "./googleCalendarCallback";
import {
  encodeCalendarOAuthState,
  newCalendarOAuthNonce,
  verifyCalendarOAuthState,
} from "./googleCalendarOAuth";

test("signed OAuth state is bound to the browser nonce, employee, workspace and expiry", () => {
  const nonce = newCalendarOAuthNonce();
  const now = Date.now();
  const secret = "test-secret";
  const value = {
    userId: "alice",
    workspaceId: "org-a",
    accountId: "ca_a",
    nonce,
  };
  const cookie = encodeCalendarOAuthState(value, secret, now);
  const input = {
    cookie,
    nonce,
    userId: "alice",
    workspaceId: "org-a",
    secret,
    now,
  };
  assert.equal(verifyCalendarOAuthState(input).accountId, "ca_a");
  assert.throws(() => verifyCalendarOAuthState({ ...input, userId: "bob" }));
  assert.throws(() =>
    verifyCalendarOAuthState({ ...input, workspaceId: "org-b" })
  );
  assert.throws(() =>
    verifyCalendarOAuthState({ ...input, nonce: newCalendarOAuthNonce() })
  );
  assert.throws(() =>
    verifyCalendarOAuthState({ ...input, secret: "wrong-secret" })
  );
  assert.throws(() =>
    verifyCalendarOAuthState({ ...input, now: now + 600_000 })
  );
  assert.throws(() =>
    verifyCalendarOAuthState({ ...input, cookie: cookie + ".extra" })
  );
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...value, userId: "bob", expiresAt: now + 600_000 })
  ).toString("base64url");
  assert.throws(() =>
    verifyCalendarOAuthState({
      ...input,
      userId: "bob",
      cookie: `${forgedPayload}.${cookie.split(".")[1]}`,
    })
  );
});

test("callback parsing and cleanup preserve unrelated navigation parameters", () => {
  const query = {
    orgId: "org-a",
    roleId: "role-a",
    googleCalendar: "callback",
    calendarState: "nonce",
    status: "success",
    connected_account_id: "ca_a",
  };
  assert.deepEqual(readCalendarCallback(query), {
    state: "nonce",
    status: "success",
    connectedAccountId: "ca_a",
  });
  assert.deepEqual(withoutCalendarCallback(query), {
    orgId: "org-a",
    roleId: "role-a",
  });
  assert.deepEqual(
    readCalendarCallback({
      ...query,
      status: "failed",
      connected_account_id: undefined,
    }),
    { state: "nonce", status: "failed" }
  );
  assert.equal(readCalendarCallback({ orgId: "org-a" }), null);
  assert.throws(() => readCalendarCallback({ ...query, status: "unknown" }));
  assert.throws(() =>
    readCalendarCallback({ ...query, calendarState: ["a", "b"] })
  );
});
