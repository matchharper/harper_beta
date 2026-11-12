import assert from "node:assert/strict";
import test from "node:test";
import { sendResendEmail } from "./send";

test("uses the Harper sender despite obsolete environment settings and preserves Reply-To recipients", async () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.EMAIL_REPLY_FROM_EMAIL;
  const originalFetch = globalThis.fetch;
  const captured: { requestBody?: Record<string, unknown> } = {};

  process.env.RESEND_API_KEY = "re_test";
  process.env.EMAIL_REPLY_FROM_EMAIL = "Harper <reply@matchharper.com>";
  globalThis.fetch = (async (_input, init) => {
    captured.requestBody = JSON.parse(String(init?.body)) as Record<
      string,
      unknown
    >;
    return new Response(JSON.stringify({ id: "email_test" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;

  try {
    await sendResendEmail({
      html: "<p>Hello</p>",
      replyTo: [
        " candidate@example.com ",
        "",
        "recruiter@example.com",
      ],
      subject: "Introduction",
      text: "Hello",
      to: "candidate@example.com",
    });

    assert.equal(captured.requestBody?.from, "Harper <hello@matchharper.com>");
    assert.deepEqual(captured.requestBody?.reply_to, [
      "candidate@example.com",
      "recruiter@example.com",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }
    if (originalFromEmail === undefined) {
      delete process.env.EMAIL_REPLY_FROM_EMAIL;
    } else {
      process.env.EMAIL_REPLY_FROM_EMAIL = originalFromEmail;
    }
  }
});
