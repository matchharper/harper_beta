import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  ComposioApiError,
  createComposioGmailConnectLink,
  executeComposioGmailFetchEmails,
  getIntegrationErrorDiagnostics,
  listActiveComposioGmailAccounts,
} from "./composio";

function useTestEnv(t: TestContext) {
  const values = {
    COMPOSIO_API_KEY: "test-composio-secret-key",
    COMPOSIO_GMAIL_AUTH_CONFIG_ID: "ac_gmail_test",
  };
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
}

const connectArgs = {
  callbackUrl: "http://localhost:3000/career/profile?gmailConnect=callback",
  userId: "talent-a",
};

test("preserves connection diagnostics without raw responses or credentials", async (t) => {
  useTestEnv(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: {
          code: 403,
          slug: "InsufficientPermissions",
          message:
            "Write permission denied for test-composio-secret-key; access_token=provider-secret; user@example.com",
          request_id: "req_test_connection",
          suggested_fix: "Enable connected account write access",
          credentials: { refresh_token: "never-log-this-refresh-token" },
        },
        data: { emails: [{ content: "private email contents" }] },
      },
      { status: 403 }
    )
  );

  await assert.rejects(
    createComposioGmailConnectLink(connectArgs),
    (error: unknown) => {
      assert.ok(error instanceof ComposioApiError);
      assert.equal(error.status, 403);
      const diagnostics = getIntegrationErrorDiagnostics(error);
      assert.equal(diagnostics.slug, "InsufficientPermissions");
      assert.equal(diagnostics.requestId, "req_test_connection");
      assert.equal(
        diagnostics.suggestedFix,
        "Enable connected account write access"
      );
      assert.match(diagnostics.providerMessage!, /Write permission denied/);
      for (const secret of [
        "test-composio-secret-key",
        "provider-secret",
        "user@example.com",
        "never-log-this-refresh-token",
        "private email contents",
      ]) {
        assert.equal(JSON.stringify(diagnostics).includes(secret), false);
      }
      return true;
    }
  );
});

test("identifies missing API key instead of hiding it as a network failure", async (t) => {
  useTestEnv(t);
  delete process.env.COMPOSIO_API_KEY;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not call Composio without an API key");
  });
  await assert.rejects(
    createComposioGmailConnectLink(connectArgs),
    (error: unknown) => {
      const diagnostics = getIntegrationErrorDiagnostics(error);
      assert.equal(diagnostics.code, "MISSING_ENV");
      assert.equal(diagnostics.message, "COMPOSIO_API_KEY is required");
      return true;
    }
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("preserves DNS failure codes without logging request headers", async (t) => {
  useTestEnv(t);
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed", {
      cause: {
        code: "ENOTFOUND",
        headers: { "x-api-key": "test-composio-secret-key" },
      },
    });
  });
  await assert.rejects(
    createComposioGmailConnectLink(connectArgs),
    (error: unknown) => {
      const diagnostics = getIntegrationErrorDiagnostics(error);
      assert.equal(diagnostics.causeCode, "ENOTFOUND");
      assert.equal(
        JSON.stringify(diagnostics).includes("test-composio-secret-key"),
        false
      );
      return true;
    }
  );
});

test("keeps HTTP status for non-JSON failures without retaining HTML", async (t) => {
  useTestEnv(t);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("<html>private upstream response</html>", { status: 502 })
  );
  await assert.rejects(
    createComposioGmailConnectLink(connectArgs),
    (error: unknown) => {
      assert.ok(error instanceof ComposioApiError);
      assert.equal(error.status, 502);
      assert.equal(
        JSON.stringify(getIntegrationErrorDiagnostics(error)).includes(
          "private upstream"
        ),
        false
      );
      return true;
    }
  );
});

test("does not retain email tool error bodies in diagnostics", async (t) => {
  useTestEnv(t);
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        error: { message: "private email content echoed by provider" },
        data: { messages: [{ body: "private email body" }] },
      },
      { status: 500 }
    )
  );
  await assert.rejects(
    executeComposioGmailFetchEmails({
      arguments: { query: "interview", user_id: "me" },
      connectedAccountId: "ca_test",
      userId: "talent-a",
    }),
    (error: unknown) => {
      assert.equal(
        JSON.stringify(getIntegrationErrorDiagnostics(error)).includes(
          "private email"
        ),
        false
      );
      return true;
    }
  );
});

test("redacts credentials and callback tokens in non-Composio errors", (t) => {
  useTestEnv(t);
  const error = new Error(
    'Failed: test-composio-secret-key Bearer hidden-bearer refresh_token="hidden refresh" https://localhost:3000/callback?code=hidden-code'
  );
  const diagnostics = getIntegrationErrorDiagnostics(error);
  for (const secret of [
    "test-composio-secret-key",
    "hidden-bearer",
    "hidden refresh",
    "hidden-code",
  ]) {
    assert.equal(JSON.stringify(diagnostics).includes(secret), false);
  }
});

test("successful connection requests preserve the localhost callback", async (t) => {
  useTestEnv(t);
  t.mock.method(
    globalThis,
    "fetch",
    async (_input: unknown, init?: RequestInit) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        auth_config_id: "ac_gmail_test",
        callback_url: connectArgs.callbackUrl,
        user_id: "talent-a",
      });
      return Response.json(
        {
          connected_account_id: "ca_test",
          redirect_url: "https://connect.composio.dev/session",
        },
        { status: 201 }
      );
    }
  );
  const result = await createComposioGmailConnectLink(connectArgs);
  assert.equal(result.redirectUrl, "https://connect.composio.dev/session");
});

test("Gmail account discovery is scoped to the authenticated Composio user", async (t) => {
  useTestEnv(t);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/api/v3.1/connected_accounts");
    assert.equal(url.searchParams.get("user_ids"), "talent-a");
    assert.equal(url.searchParams.get("toolkit_slugs"), "gmail");
    assert.equal(url.searchParams.get("auth_config_ids"), "ac_gmail_test");
    assert.equal(url.searchParams.get("statuses"), "ACTIVE");
    return Response.json({
      items: [
        {
          id: "ca_test",
          user_id: "talent-a",
          toolkit: { slug: "gmail" },
          auth_config: { id: "ac_gmail_test" },
          status: "ACTIVE",
          credentials: { refresh_token: "must-not-escape" },
        },
      ],
    });
  });

  const accounts = await listActiveComposioGmailAccounts("talent-a");
  assert.deepEqual(accounts, [
    {
      id: "ca_test",
      user_id: "talent-a",
      toolkit: { slug: "gmail" },
      auth_config: { id: "ac_gmail_test", is_disabled: undefined },
      status: "ACTIVE",
      is_disabled: undefined,
    },
  ]);
  assert.equal(JSON.stringify(accounts).includes("must-not-escape"), false);
});
