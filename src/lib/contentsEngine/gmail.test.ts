import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGmailRawMessage,
  isGmailNotFoundError,
  parseGmailMessage,
} from "@/lib/contentsEngine/gmail";

test("recognizes Gmail's missing-message error without masking other failures", () => {
  assert.equal(
    isGmailNotFoundError(
      new Error("Gmail API 404: Requested entity was not found.")
    ),
    true
  );
  assert.equal(
    isGmailNotFoundError(new Error("Gmail API 403: Permission denied")),
    false
  );
});

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
  assert.equal(parsed.deliveryFailure, null);
});

test("parses a structured Gmail delivery status receipt", () => {
  const deliveryStatus = [
    "Final-Recipient: rfc822; creator@example.com",
    "Action: failed",
    "Status: 5.1.1",
    "Diagnostic-Code: smtp; 550 5.1.1 User unknown",
  ].join("\r\n");
  const parsed = parseGmailMessage({
    id: "gmail-bounce-1",
    internalDate: String(Date.parse("2026-09-17T10:05:00Z")),
    labelIds: ["INBOX"],
    threadId: "gmail-thread-1",
    payload: {
      headers: [
        { name: "From", value: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" },
        { name: "To", value: "harper@matchharper.com" },
        { name: "Subject", value: "Delivery Status Notification (Failure)" },
        { name: "In-Reply-To", value: "<gtm-fixture@matchharper.com>" },
      ],
      mimeType: "multipart/report",
      parts: [
        {
          body: {
            data: Buffer.from("Address not found.").toString("base64url"),
          },
          mimeType: "text/plain",
        },
        {
          body: {
            data: Buffer.from(deliveryStatus).toString("base64url"),
          },
          headers: [
            { name: "Content-Type", value: "message/delivery-status" },
          ],
          mimeType: "message/delivery-status",
        },
      ],
    },
  });
  assert.deepEqual(parsed.deliveryFailure, {
    diagnosticCode: "smtp; 550 5.1.1 User unknown",
    finalRecipient: "creator@example.com",
    status: "5.1.1",
  });
  assert.equal(parsed.body, "Address not found.");
});

test("does not treat a successful delivery receipt as a bounce", () => {
  const parsed = parseGmailMessage({
    id: "gmail-delivered-1",
    threadId: "gmail-thread-1",
    payload: {
      mimeType: "multipart/report",
      parts: [
        {
          body: {
            data: Buffer.from(
              "Final-Recipient: rfc822; creator@example.com\r\nAction: delivered\r\nStatus: 2.0.0"
            ).toString("base64url"),
          },
          mimeType: "message/delivery-status",
        },
      ],
    },
  });
  assert.equal(parsed.deliveryFailure, null);
});
