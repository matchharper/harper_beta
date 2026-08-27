import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { ComposioApiError } from "./composio";
import type { GoogleCalendarService } from "./googleCalendar";
import { GoogleCalendarError } from "./googleCalendarError";
import { createGoogleCalendarHandlers } from "./googleCalendarHandlers";
import {
  CALENDAR_OAUTH_COOKIE,
  encodeCalendarOAuthState,
} from "./googleCalendarOAuth";

const origin = "http://localhost:3000";
const secret = "test-only-state-signing-key";
const nonce = "n".repeat(43);
const workspaceId = "workspace-a";

function fixture() {
  const calls: string[] = [];
  let callbackUrl = "";
  const service: GoogleCalendarService = {
    async requireActiveAccountId(userId) {
      calls.push(`require:${userId}`);
      return "ca_alice";
    },
    async getStatus(userId) {
      calls.push(`status:${userId}`);
      return { provider: "google_calendar", status: "not_connected" };
    },
    async connect(userId, callback) {
      calls.push(`connect:${userId}`);
      callbackUrl = callback;
      return {
        status: "redirect",
        accountId: "ca_alice",
        authorizeUrl: "https://connect.composio.dev/link/test",
      };
    },
    async complete(userId, id) {
      calls.push(`complete:${userId}:${id}`);
    },
    async disconnect(userId) {
      calls.push(`disconnect:${userId}`);
    },
  };
  const handlers = createGoogleCalendarHandlers({
    getStateSecret: () => secret,
    async getContext(req, workspace) {
      const identity = req.headers.get("authorization");
      if (!identity)
        throw new GoogleCalendarError(
          401,
          "UNAUTHORIZED",
          "로그인이 필요해요."
        );
      if (workspace !== workspaceId)
        throw new GoogleCalendarError(
          403,
          "WORKSPACE_ACCESS_DENIED",
          "접근할 수 없어요."
        );
      // Both identities are workspace viewers; neither has admin privileges.
      return { userId: identity, service };
    },
  });
  const cookie = encodeCalendarOAuthState(
    { userId: "alice", workspaceId, accountId: "ca_alice", nonce },
    secret
  );
  const body = {
    workspaceId,
    state: nonce,
    connectedAccountId: "ca_alice",
    status: "success",
  };
  function req(
    method: string,
    payload: unknown,
    options: {
      identity?: string;
      cookie?: string;
      origin?: string;
      path?: string;
    } = {}
  ) {
    return new NextRequest(
      `${origin}/api/org/integrations/google-calendar${options.path ?? ""}`,
      {
        method,
        headers: {
          Authorization: options.identity ?? "alice",
          Origin: options.origin ?? origin,
          "Content-Type": "application/json",
          Cookie: `${CALENDAR_OAUTH_COOKIE}=${options.cookie ?? cookie}`,
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(payload) }),
      }
    );
  }
  return {
    handlers,
    service,
    calls,
    cookie,
    body,
    req,
    callback: () => callbackUrl,
  };
}

test("connect sets an expiring HttpOnly session cookie and retains the workspace", async () => {
  const f = fixture();
  const response = await f.handlers.connect(f.req("POST", { workspaceId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "redirect",
    authorizeUrl: "https://connect.composio.dev/link/test",
  });
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(response.headers.get("set-cookie") ?? "", /SameSite=lax/i);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=600/i);
  const callback = new URL(f.callback());
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, "/org/settings");
  assert.equal(callback.searchParams.get("orgId"), workspaceId);
  assert.equal(callback.searchParams.get("calendarState")?.length, 43);
  assert.deepEqual(f.calls, ["connect:alice"]);
});

test("successful completion uses the cookie's account ID and clears the callback cookie", async () => {
  const f = fixture();
  const response = await f.handlers.complete(f.req("POST", f.body));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "active" });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/i);
  assert.deepEqual(f.calls, ["complete:alice:ca_alice"]);
});

test("an OAuth failure returns cancelled without storing or executing anything", async () => {
  const f = fixture();
  const response = await f.handlers.complete(
    f.req("POST", {
      ...f.body,
      status: "failed",
      connectedAccountId: undefined,
    })
  );
  assert.deepEqual(await response.json(), { status: "cancelled" });
  assert.deepEqual(f.calls, []);
});

test("a different signed-in employee cannot complete the owner's OAuth attempt", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  assert.equal(
    (await f.handlers.complete(f.req("POST", f.body, { identity: "bob" })))
      .status,
    400
  );
  assert.deepEqual(f.calls, []);
});

for (const field of [
  "userId",
  "company_user_id",
  "talent_id",
  "connected_account_id",
  "provider",
]) {
  test(`connect rejects injected ${field} before accessing a connection`, async (t) => {
    t.mock.method(console, "error", () => {});
    const f = fixture();
    assert.equal(
      (await f.handlers.connect(f.req("POST", { workspaceId, [field]: "bob" })))
        .status,
      400
    );
    assert.deepEqual(f.calls, []);
  });
}

test("get and delete also reject owner/account selectors", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  assert.equal(
    (
      await f.handlers.GET(
        f.req("GET", null, { path: `?workspaceId=${workspaceId}&userId=bob` })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await f.handlers.DELETE(
        f.req("DELETE", { workspaceId, connectedAccountId: "ca_bob" })
      )
    ).status,
    400
  );
  assert.deepEqual(f.calls, []);
});

test("completion rejects a substituted connected account, nonce, or missing cookie", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  assert.equal(
    (
      await f.handlers.complete(
        f.req("POST", { ...f.body, connectedAccountId: "ca_bob" })
      )
    ).status,
    400
  );
  assert.equal(
    (await f.handlers.complete(f.req("POST", { ...f.body, state: "other" })))
      .status,
    400
  );
  assert.equal(
    (await f.handlers.complete(f.req("POST", f.body, { cookie: "" }))).status,
    400
  );
  assert.deepEqual(f.calls, []);
});

test("expired OAuth and cross-site requests fail closed", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  const expired = encodeCalendarOAuthState(
    { userId: "alice", workspaceId, accountId: "ca_alice", nonce },
    secret,
    Date.now() - 700_000
  );
  const response = await f.handlers.complete(
    f.req("POST", f.body, { cookie: expired })
  );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "OAUTH_STATE_EXPIRED");
  assert.equal(
    (
      await f.handlers.connect(
        f.req("POST", { workspaceId }, { origin: "https://attacker.test" })
      )
    ).status,
    403
  );
  assert.deepEqual(f.calls, []);
});

test("unauthenticated users and non-members never reach the integration service", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  assert.equal(
    (await f.handlers.connect(f.req("POST", { workspaceId }, { identity: "" })))
      .status,
    401
  );
  assert.equal(
    (await f.handlers.connect(f.req("POST", { workspaceId: "workspace-b" })))
      .status,
    403
  );
  assert.deepEqual(f.calls, []);
});

test("a save failure preserves the cookie for retry and does not expose database details", async (t) => {
  const logger = t.mock.method(console, "error", () => {});
  const f = fixture();
  f.service.complete = async () => {
    throw new Error("database row contained secret-token");
  };
  const response = await f.handlers.complete(f.req("POST", f.body));
  assert.equal(response.status, 500);
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal((await response.json()).code, "STORAGE_ERROR");
  assert.doesNotMatch(JSON.stringify(logger.mock.calls), /secret-token/);
});

test("vendor permission errors provide safe setup guidance instead of an empty 500", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  f.service.connect = async () => {
    throw new ComposioApiError("forbidden", 403, {
      code: 812,
      slug: "APIKey_InsufficientPermissions",
    });
  };
  const response = await f.handlers.connect(f.req("POST", { workspaceId }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "CONFIGURATION_ERROR");
});

test("disconnect failure is not reported as success and invalidates the browser OAuth attempt", async (t) => {
  t.mock.method(console, "error", () => {});
  const f = fixture();
  f.service.disconnect = async () => {
    throw new ComposioApiError("timeout", 504);
  };
  const response = await f.handlers.DELETE(f.req("DELETE", { workspaceId }));
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "VENDOR_UNAVAILABLE");
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("all public responses are non-cacheable", async () => {
  const f = fixture();
  const response = await f.handlers.GET(
    f.req("GET", null, { path: `?workspaceId=${workspaceId}` })
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), {
    provider: "google_calendar",
    status: "not_connected",
  });
});
