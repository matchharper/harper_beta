import assert from "node:assert/strict";
import test from "node:test";

test("does not advance Gmail history until Resend exposes the RFC Message-ID", async () => {
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
  const requests: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/rest/v1/gtm_outreach_dispatches")) {
      return new Response(
        JSON.stringify([
          {
            id: "11111111-1111-4111-8111-111111111111",
            provider_message_id: "resend-email-1",
            sent_at: "2026-09-21T00:00:00.000Z",
          },
        ]),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (url === "https://api.resend.com/emails/resend-email-1") {
      return new Response(JSON.stringify({ id: "resend-email-1" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(
      `Gmail was reached before reply identity was ready: ${url}`
    );
  }) as typeof fetch;

  try {
    const { syncGtmOutreachGmailHistory } = await import("./outreach");
    await assert.rejects(
      syncGtmOutreachGmailHistory("123456789"),
      /Resend Message-ID is not ready/
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    names.forEach((name, index) => {
      if (previousEnv[index] === undefined) delete process.env[name];
      else process.env[name] = previousEnv[index];
    });
  }
});
