import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGmailRawMessage,
  parseGmailMessage,
} from "@/lib/contentsEngine/gmail";

test("builds a Gmail API message with the stable RFC Message-ID", () => {
  const raw = buildGmailRawMessage({
    body: "안녕하세요.\nHarper 협업 제안입니다.",
    from: "harper@matchharper.com",
    messageId: "<gtm-fixture@matchharper.com>",
    subject: "Harper 협업 제안",
    to: "creator@example.com",
  });
  const mime = Buffer.from(raw, "base64url").toString("utf8");
  assert.match(mime, /From: harper@matchharper\.com/);
  assert.match(mime, /To: creator@example\.com/);
  assert.match(mime, /Message-ID: <gtm-fixture@matchharper\.com>/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  const encodedBody = mime.split("\r\n\r\n")[1]?.replace(/\r\n/g, "") ?? "";
  assert.equal(
    Buffer.from(encodedBody, "base64").toString("utf8"),
    "안녕하세요.\nHarper 협업 제안입니다."
  );
});

test("parses an inbound Gmail reply with thread and reply headers", () => {
  const parsed = parseGmailMessage({
    id: "gmail-message-1",
    internalDate: String(Date.parse("2026-09-17T10:00:00Z")),
    labelIds: ["INBOX"],
    threadId: "gmail-thread-1",
    payload: {
      headers: [
        { name: "From", value: "Creator <creator@example.com>" },
        { name: "To", value: "harper@matchharper.com" },
        { name: "Subject", value: "Re: Harper collaboration" },
        { name: "Message-ID", value: "<reply@example.com>" },
        { name: "In-Reply-To", value: "<gtm-fixture@matchharper.com>" },
        {
          name: "References",
          value: "<gtm-fixture@matchharper.com>",
        },
      ],
      mimeType: "multipart/alternative",
      parts: [
        {
          body: {
            data: Buffer.from("네, 자세히 이야기해보고 싶어요.").toString(
              "base64url"
            ),
          },
          mimeType: "text/plain",
        },
      ],
    },
  });
  assert.equal(parsed.fromEmail, "creator@example.com");
  assert.equal(parsed.toEmail, "harper@matchharper.com");
  assert.equal(parsed.threadId, "gmail-thread-1");
  assert.equal(parsed.inReplyTo, "<gtm-fixture@matchharper.com>");
  assert.equal(parsed.body, "네, 자세히 이야기해보고 싶어요.");
  assert.equal(parsed.receivedAt, "2026-09-17T10:00:00.000Z");
});
