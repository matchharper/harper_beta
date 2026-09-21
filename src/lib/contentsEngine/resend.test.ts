import assert from "node:assert/strict";
import test from "node:test";
import {
  GTM_OUTREACH_RESEND_FROM,
  GTM_OUTREACH_RESEND_REPLY_TO,
  renderFinalEmailBodyHtml,
  renderFinalEmailBodyText,
  sendGtmOutreachEmailWithResend,
} from "@/lib/contentsEngine/resend";

test("renders reviewed HTML without escaping and keeps a text fallback", () => {
  const body =
    '<table><tr><td><strong style="color:#111">Hello</strong><br>Thanks</td></tr></table>';

  assert.equal(
    renderFinalEmailBodyHtml(body),
    `<div style="white-space: pre-wrap;">${body}</div>`
  );
  assert.equal(renderFinalEmailBodyText(body), "Hello\nThanks");
});

test("preserves legacy plain-text line breaks", () => {
  const body = "Hello\nThanks";

  assert.equal(
    renderFinalEmailBodyHtml(body),
    '<div style="white-space: pre-wrap;">Hello\nThanks</div>'
  );
  assert.equal(renderFinalEmailBodyText(body), body);
});

test("does not confuse an accepted Resend email ID with an RFC Message-ID", async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re_test";
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({ id: "resend-email-fallback" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    const result = await sendGtmOutreachEmailWithResend({
      body: "Hello",
      dispatchId: "dispatch-fallback",
      subject: "Fallback",
      to: "creator@example.com",
    });

    assert.deepEqual(result, {
      emailId: "resend-email-fallback",
      messageId: null,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
  }
});

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
      body: '<p>Hello</p><p><strong style="color:#111">Paid partnership</strong><br><a href="https://matchharper.com">View Harper</a></p>',
      dispatchId: "dispatch-1",
      inReplyTo: "<reply@creator.example>",
      references: "<original@harper.example>\r\n <reply@creator.example>",
      subject: "Collaboration",
      to: "creator@example.com",
    });

    assert.deepEqual(result, {
      emailId: "resend-email-1",
      messageId: "<resend-message-1@matchharper.com>",
    });
    assert.deepEqual(requests[0]?.body?.headers, {
      "In-Reply-To": "<reply@creator.example>",
      References: "<original@harper.example> <reply@creator.example>",
    });
    assert.equal(requests[0]?.body?.from, GTM_OUTREACH_RESEND_FROM);
    assert.equal(requests[0]?.body?.reply_to, GTM_OUTREACH_RESEND_REPLY_TO);
    assert.equal(
      requests[0]?.body?.html,
      '<div style="white-space: pre-wrap;"><p>Hello</p><p><strong style="color:#111">Paid partnership</strong><br><a href="https://matchharper.com">View Harper</a></p></div>'
    );
    assert.equal(
      requests[0]?.body?.text,
      "Hello\nPaid partnership\nView Harper"
    );
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
