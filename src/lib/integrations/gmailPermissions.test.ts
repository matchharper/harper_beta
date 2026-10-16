import assert from "node:assert/strict";
import test from "node:test";
import { createComposioClient, getComposioGmailReadAccess } from "./composio";
import { executeConnectedGmailSearch } from "./gmail";

test("uses granted scopes, not requested scopes, and drops credentials", async (t) => {
  const previous = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = "fixture";
  t.after(() => {
    if (previous === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previous;
  });
  for (const [scope, expected] of [
    ["openid https://www.googleapis.com/auth/userinfo.email", "missing"],
    ["https://mail.google.com/ openid", "granted"],
    ["https://www.googleapis.com/auth/gmail.readonly", "granted"],
    ["https://www.googleapis.com/auth/gmail.modify", "granted"],
    ["https://www.googleapis.com/auth/gmail.metadata", "missing"],
    ["", "missing"],
    [undefined, "unknown"],
  ] as const) {
    const client = createComposioClient({
      fetch: async () =>
        Response.json({
          id: "ca_fixture",
          status: "ACTIVE",
          requested_scopes: ["https://mail.google.com/"],
          state: {
            val: {
              scope,
              access_token: "private-token",
              refresh_token: "private-refresh",
            },
          },
        }),
    });
    const account = await client.getAccount("ca_fixture");
    assert.equal(getComposioGmailReadAccess(account), expected);
    assert.equal(JSON.stringify(account).includes("private-"), false);
    assert.equal("requested_scopes" in account, false);
  }
});

test("a partial Google grant stops before fetching mail without changing the connection", async (t) => {
  const env = {
    COMPOSIO_API_KEY: "fixture",
    COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_fixture",
  };
  for (const [key, value] of Object.entries(env)) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    calls.push(String(input));
    assert.ok(String(input).endsWith("/connected_accounts/ca_fixture"));
    return Response.json({
      id: "ca_fixture",
      user_id: "talent-fixture",
      toolkit: { slug: "gmail" },
      auth_config: { id: "ac_fixture" },
      status: "ACTIVE",
      data: { scope: "openid" },
    });
  });
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: { status: "active", composio_connected_account_id: "ca_fixture" },
      error: null,
    }),
  };
  const admin = { from: () => query } as unknown as Parameters<
    typeof executeConnectedGmailSearch
  >[0]["admin"];
  const result = await executeConnectedGmailSearch({
    admin,
    talentId: "talent-fixture",
    includeContent: false,
    maxResults: 20,
    query: "subject:interview",
  });
  assert.equal(result.status, "permissions_required");
  assert.deepEqual(result.emails, []);
  assert.equal(calls.length, 1);
});

test("import continuation requires the matching user's explicit action and is consumed once", async () => {
  const { rememberGmailImportIntent, consumeGmailImportIntent } =
    await import("./gmailImportIntent");
  const values = new Map<string, string>();
  const storage = {
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    getItem: (k: string) => values.get(k) ?? null,
    removeItem: (k: string) => {
      values.delete(k);
    },
  };
  assert.equal(consumeGmailImportIntent(storage, "talent-a", "ca_a"), false);
  rememberGmailImportIntent(storage, "talent-a", "ca_a");
  assert.equal(consumeGmailImportIntent(storage, "talent-b", "ca_a"), false);
  assert.equal(
    consumeGmailImportIntent(storage, "talent-a", "ca_other"),
    false
  );
  assert.equal(consumeGmailImportIntent(storage, "talent-a", "ca_a"), true);
  assert.equal(consumeGmailImportIntent(storage, "talent-a", "ca_a"), false);
});
