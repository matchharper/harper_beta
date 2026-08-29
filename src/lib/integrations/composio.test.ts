import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import {
  ComposioApiError,
  createComposioClient,
  getComposioAccountStatus,
  getIntegrationErrorDiagnostics,
  isOwnedComposioGmailAccount,
} from "./composio";

const priorKey = process.env.COMPOSIO_API_KEY;
before(() => {
  process.env.COMPOSIO_API_KEY = "test-project-key-never-log";
});
after(() => {
  if (priorKey === undefined) delete process.env.COMPOSIO_API_KEY;
  else process.env.COMPOSIO_API_KEY = priorKey;
});

test("requires exact Gmail user and auth config ownership", (t) => {
  const priorAuthConfig = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "ac_gmail_test";
  t.after(() => {
    if (priorAuthConfig === undefined) {
      delete process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID;
    } else {
      process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = priorAuthConfig;
    }
  });
  const account = {
    auth_config: { id: "ac_gmail_test" },
    id: "ca_test",
    status: "ACTIVE",
    toolkit: { slug: "gmail" },
    user_id: "talent-a",
  };

  assert.equal(isOwnedComposioGmailAccount(account, "talent-a"), true);
  assert.equal(isOwnedComposioGmailAccount(account, "talent-b"), false);
  assert.equal(
    isOwnedComposioGmailAccount(
      { ...account, auth_config: { id: "ac_other" } },
      "talent-a"
    ),
    false
  );
  assert.equal(
    isOwnedComposioGmailAccount(
      { ...account, toolkit: { slug: "googlecalendar" } },
      "talent-a"
    ),
    false
  );
});

test("treats a disabled Composio account as inactive", () => {
  assert.equal(
    getComposioAccountStatus({ is_disabled: true, status: "ACTIVE" }),
    "INACTIVE"
  );
  assert.equal(getComposioAccountStatus({ status: "expired" }), "EXPIRED");
});

test("creates a private connection using the server's user and auth config, not an event tool", async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const client = createComposioClient({
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return Response.json({
        connected_account_id: "ca_test",
        redirect_url: "https://connect.composio.dev/link/test",
      });
    },
  });
  const result = await client.createLink({
    userId: "alice",
    authConfigId: "ac_calendar",
    callbackUrl: "http://localhost:3000/org/settings",
  });
  assert.equal(result.accountId, "ca_test");
  assert.equal(
    calls[0].url,
    "https://backend.composio.dev/api/v3.1/connected_accounts/link"
  );
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    auth_config_id: "ac_calendar",
    user_id: "alice",
    callback_url: "http://localhost:3000/org/settings",
  });
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(
    (calls[0].init?.headers as Record<string, string>)["x-api-key"],
    "test-project-key-never-log"
  );
});

test("rejects untrusted redirect destinations and missing connection IDs", async () => {
  for (const body of [
    {
      connected_account_id: "ca_test",
      redirect_url: "https://attacker.test/link",
    },
    { connected_account_id: "ca_test", redirect_url: "javascript:alert(1)" },
    { redirect_url: "https://connect.composio.dev/link/test" },
  ]) {
    const client = createComposioClient({
      fetch: async () => Response.json(body),
    });
    await assert.rejects(
      client.createLink({
        userId: "alice",
        authConfigId: "ac_calendar",
        callbackUrl: "http://localhost:3000/org/settings",
      })
    );
  }
});

test("retains sanitized connection diagnostics but never credentials or raw account data", async () => {
  const client = createComposioClient({
    fetch: async () =>
      Response.json(
        {
          error: {
            code: 812,
            slug: "APIKey_InsufficientPermissions",
            request_id: "request-test",
            message:
              'key test-project-key-never-log access_token="oauth-secret" alice@example.com https://secret.test/token',
            suggested_fix: "Grant connected_accounts write access",
          },
          connection_data: { refresh_token: "raw-credential-must-not-leak" },
        },
        { status: 403 }
      ),
  });
  await assert.rejects(client.getAccount("ca_test"), (error: unknown) => {
    assert.ok(error instanceof ComposioApiError);
    assert.equal(error.status, 403);
    const diagnostics = getIntegrationErrorDiagnostics(error);
    assert.equal("code" in diagnostics && diagnostics.code, 812);
    assert.match(JSON.stringify(diagnostics), /request-test/);
    assert.equal(
      diagnostics.suggestedFix,
      "Grant connected_accounts write access"
    );
    assert.match(diagnostics.providerMessage ?? "", /\[redacted\]/);
    assert.doesNotMatch(
      JSON.stringify(diagnostics),
      /test-project-key-never-log|oauth-secret|alice@example.com|secret.test|raw-credential/
    );
    return true;
  });
});

test("database diagnostics retain only the error code, never row details", () => {
  const diagnostics = getIntegrationErrorDiagnostics({
    code: "23503",
    message: "private row data",
    details: "user email and credential",
  });
  assert.deepEqual(diagnostics, { name: "IntegrationError", code: "23503" });
});

test("invalid JSON, network failure and timeout become safe errors", async () => {
  const invalid = createComposioClient({
    fetch: async () => new Response("not-json"),
  });
  await assert.rejects(
    invalid.getAccount("ca_test"),
    (error: unknown) =>
      error instanceof ComposioApiError && error.status === 502
  );
  const network = createComposioClient({
    fetch: async () => {
      throw new Error("raw secret network data");
    },
  });
  await assert.rejects(
    network.getAccount("ca_test"),
    (error: unknown) =>
      error instanceof ComposioApiError && !error.message.includes("secret")
  );
  const timeout = createComposioClient({
    timeoutMs: 5,
    fetch: async (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true }
        );
      }),
  });
  await assert.rejects(
    timeout.getAccount("ca_test"),
    (error: unknown) =>
      error instanceof ComposioApiError && error.status === 504
  );
});

test("lifecycle methods use only connected-account endpoints", async () => {
  const requests: string[] = [];
  const client = createComposioClient({
    fetch: async (url, init) => {
      requests.push(`${init?.method ?? "GET"} ${url}`);
      return init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json({
            connected_account: { id: "ca_test", status: "REVOKED" },
          });
    },
  });
  await client.getAccount("ca_test");
  await client.revokeAccount("ca_test");
  await client.deleteAccount("ca_test");
  assert.ok(
    requests.every((request) => request.includes("/connected_accounts/"))
  );
  assert.ok(requests[1].endsWith("/ca_test/revoke"));
  assert.match(requests[2], /^DELETE /);
  await assert.rejects(client.getAccount("../ca_bob"));
  assert.equal(requests.length, 3);
});

test("account reads strip raw credential fields and lifecycle responses must confirm success", async () => {
  const client = createComposioClient({
    fetch: async () =>
      Response.json({
        id: "ca_test",
        user_id: "alice",
        status: "ACTIVE",
        toolkit: { slug: "googlecalendar" },
        auth_config: { id: "ac_calendar" },
        state: {
          val: { access_token: "raw-access", refresh_token: "raw-refresh" },
        },
        params: { secret: "raw-params" },
      }),
  });
  assert.doesNotMatch(
    JSON.stringify(await client.getAccount("ca_test")),
    /raw-access|raw-refresh|raw-params/
  );
  const malformed = createComposioClient({
    fetch: async () => Response.json({ success: false }),
  });
  await assert.rejects(malformed.revokeAccount("ca_test"));
  await assert.rejects(malformed.deleteAccount("ca_test"));
});

test("executes a pinned tool for the verified connected account without exposing vendor failures", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = createComposioClient({
    fetch: async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return Response.json({ data: { items: [] }, successful: true });
    },
  });
  assert.deepEqual(
    await client.executeTool<{ items: unknown[] }>({
      accountId: "ca_test",
      arguments: { calendarId: "primary" },
      slug: "GOOGLECALENDAR_EVENTS_LIST",
      userId: "alice",
      version: "20260826_00",
    }),
    { items: [] }
  );
  assert.equal(
    requests[0].url,
    "https://backend.composio.dev/api/v3.1/tools/execute/GOOGLECALENDAR_EVENTS_LIST"
  );
  assert.deepEqual(requests[0].body, {
    arguments: { calendarId: "primary" },
    connected_account_id: "ca_test",
    user_id: "alice",
    version: "20260826_00",
  });

  const failed = createComposioClient({
    fetch: async () =>
      Response.json({
        successful: false,
        error: "private event from alice@example.com",
      }),
  });
  await assert.rejects(
    failed.executeTool({
      accountId: "ca_test",
      arguments: {},
      slug: "GOOGLECALENDAR_EVENTS_LIST",
      userId: "alice",
      version: "20260826_00",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ComposioApiError);
      assert.doesNotMatch(error.message, /alice|private event/);
      return true;
    }
  );
});
