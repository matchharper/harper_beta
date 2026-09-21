import assert from "node:assert/strict";
import test from "node:test";

test("approval sends only the due dispatch and preserves the reviewed HTML", async () => {
  const previousFetch = globalThis.fetch;
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
  ] as const;
  const previousEnv = names.map((name) => process.env[name]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fixture-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-key";
  process.env.RESEND_API_KEY = "fixture-key";
  const calls: string[] = [];
  const dispatch = {
    id: "11111111-1111-4111-8111-111111111111",
    status: "approved",
    scheduled_at: "2026-01-01T00:00:00Z",
    body: "<h2>제안</h2><p><strong>굵게</strong><u>밑줄</u></p>",
    subject: "검토한 제목",
    recipient_email: "creator@example.test",
  };
  let finalRecord: Record<string, unknown> = dispatch;
  let metadataFailure = false;
  let providerFailure = false;
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const response = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    if (url.endsWith("/rpc/gtm_outreach_worker_claim")) {
      assert.deepEqual(body, { p_dispatch_id: dispatch.id, p_limit: 1 });
      return response([dispatch]);
    }
    if (url === "https://api.resend.com/emails") {
      assert.equal(
        body.html,
        `<div style="white-space: pre-wrap;">${dispatch.body}</div>`
      );
      assert.equal(body.subject, dispatch.subject);
      assert.deepEqual(body.to, [dispatch.recipient_email]);
      assert.equal(
        new Headers(init?.headers).get("Idempotency-Key"),
        `gtm-outreach/${dispatch.id}`
      );
      return providerFailure
        ? response({ message: "Invalid address" }, 422)
        : response({ id: "accepted-id" });
    }
    if (url === "https://api.resend.com/emails/accepted-id") {
      return metadataFailure
        ? response({ message: "Temporary outage" }, 503)
        : response({ message_id: "<accepted@resend.test>" });
    }
    if (url.endsWith("/rpc/gtm_outreach_worker_record_delivery")) {
      assert.equal(body.p_provider, "resend");
      assert.equal(body.p_provider_message_id, "accepted-id");
      assert.equal(
        body.p_rfc_message_id,
        metadataFailure ? null : "<accepted@resend.test>"
      );
      finalRecord = { ...dispatch, status: "sent" };
      return response(finalRecord);
    }
    if (url.endsWith("/rpc/gtm_outreach_worker_mark_failed")) {
      assert.equal(body.p_retryable, false);
      finalRecord = { ...dispatch, status: "failed", last_error: body.p_error };
      return response(finalRecord);
    }
    throw new Error(`Unexpected network call: ${url}`);
  }) as typeof fetch;
  try {
    const { deliverWorkspaceApproval } = await import("./workspaceMail");
    const scheduled = {
      ...dispatch,
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
    };
    assert.deepEqual(
      await deliverWorkspaceApproval(scheduled, async () => {
        throw new Error("Future mail must not send");
      }),
      scheduled
    );
    assert.equal(calls.length, 0);
    assert.equal(
      (await deliverWorkspaceApproval(dispatch, async () => finalRecord))
        .status,
      "sent"
    );
    metadataFailure = true;
    const accepted = await deliverWorkspaceApproval(
      dispatch,
      async () => finalRecord
    );
    assert.equal(accepted.status, "sent");
    assert.equal(accepted.delivery_error, undefined);
    providerFailure = true;
    const failed = await deliverWorkspaceApproval(
      dispatch,
      async () => finalRecord
    );
    assert.equal(failed.status, "failed");
    assert.match(String(failed.delivery_error), /422/);
  } finally {
    globalThis.fetch = previousFetch;
    names.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  }
});
