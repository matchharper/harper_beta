import assert from "node:assert/strict";
import test from "node:test";
import {
  GTM_OUTREACH_RESEND_FROM,
  GTM_OUTREACH_RESEND_REPLY_TO,
  sendGtmOutreachEmailWithResend,
} from "@/lib/contentsEngine/resend";

test("sends outreach from Harper and records Resend's RFC Message-ID", async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body?: Record<string, unknown>; url: string }> = [];
  process.env.RESEND_API_KEY = "re_test";
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    requests.push({
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined,
      url,
    });
    if (url.endsWith("/emails")) {
      return new Response(JSON.stringify({ id: "resend-email-1" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        id: "resend-email-1",
        message_id: "<resend-message-1@matchharper.com>",
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  }) as typeof fetch;

  try {
    const result = await sendGtmOutreachEmailWithResend({
      body: "Hello\nThanks",
      dispatchId: "dispatch-1",
      subject: "Collaboration",
      to: "creator@example.com",
    });

    assert.deepEqual(result, {
      emailId: "resend-email-1",
      messageId: "<resend-message-1@matchharper.com>",
    });
    assert.equal(requests[0]?.body?.from, GTM_OUTREACH_RESEND_FROM);
    assert.equal(requests[0]?.body?.reply_to, GTM_OUTREACH_RESEND_REPLY_TO);
    assert.equal(requests[0]?.body?.text, "Hello\nThanks");
    assert.equal(requests[1]?.url.endsWith("/emails/resend-email-1"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  }
});
