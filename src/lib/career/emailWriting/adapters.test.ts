import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { normalizeExactMessage } from "./message";
import { normalizeThreadPage } from "./thread";
import { verifyComposioWebhook } from "./webhook";
import { formatGmailMessageForModel } from "@/lib/integrations/gmail";

test("exact Gmail messages retain RFC identity and every thread page cursor", () => {
  const message = {
    id: "m1",
    threadId: "t1",
    internalDate: "1794614400000",
    labelIds: ["INBOX"],
    payload: {
      headers: [
        { name: "Subject", value: "A real conversation" },
        { name: "MESSAGE-ID", value: "<first@company.test>" },
        { name: "References", value: "<earlier@company.test>" },
        { name: "In-Reply-To", value: "<earlier@company.test>" },
        { name: "Reply-To", value: "hiring@company.test" },
      ],
      body: {
        data: Buffer.from("Updated interview time.").toString("base64url"),
      },
      mimeType: "text/plain",
    },
  };
  const exact = normalizeExactMessage({ data: { message } });
  assert.equal(exact.messageId, "m1");
  assert.equal(exact.rfcMessageId, "<first@company.test>");
  assert.equal(exact.replyTo, "hiring@company.test");
  assert.equal(exact.content, "Updated interview time.");
  assert.deepEqual(exact.labelIds, ["INBOX"]);
  const ref = { kind: "email_message" as const, id: "account/m1", revision: "active-connection" };
  const modelText = formatGmailMessageForModel({ ...exact, resourceRef: ref });
  assert.ok(modelText.includes(JSON.stringify(ref)));
  assert.match(modelText, /Received: 2026-11-14 09:00/);
  assert.match(modelText, /Reply-To: hiring@company.test/);
  assert.match(modelText, /Updated interview time\./);
  assert.doesNotMatch(modelText, /first@company.test|labelIds|INBOX|2026-11-14T/);
  const page = normalizeThreadPage(
    { data: { messages: [message], next_page_token: "second" } },
    "t1"
  );
  assert.equal(page.nextPageToken, "second");
  assert.equal(page.messages[0].subject, "A real conversation");
  assert.throws(
    () =>
      normalizeThreadPage(
        { data: { messages: [{ ...message, threadId: "other" }] } },
        "t1"
      ),
    /different thread/
  );
});
test("Gmail webhook verification binds the exact body, delivery ID, timestamp and raw signing secret", () => {
  const secret = "whsec_raw-provider-secret",
    body = '{"type":"composio.trigger.message","data":{}}',
    timestamp = "1794614400",
    id = "delivery-one";
  const signature = createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  const headers = new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    }),
    now = Number(timestamp) * 1000;
  assert.equal(verifyComposioWebhook(body, headers, secret, now), true);
  assert.equal(verifyComposioWebhook(body + " ", headers, secret, now), false);
  assert.equal(verifyComposioWebhook(body, headers, "other", now), false);
  assert.equal(
    verifyComposioWebhook(body, headers, secret, now + 301000),
    false
  );
  headers.set("webhook-id", "other-delivery");
  assert.equal(verifyComposioWebhook(body, headers, secret, now), false);
});
