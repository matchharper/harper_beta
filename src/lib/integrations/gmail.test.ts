import assert from "node:assert/strict";
import test from "node:test";

import { formatGmailSearchResult, normalizeGmailSearchResponse } from "./gmail";
import { formatToolResultText } from "@/lib/llm/promptText";

test("normalizes Gmail messages and removes HTML and unsafe content", () => {
  const normalized = normalizeGmailSearchResponse({
    includeContent: true,
    maxResults: 1,
    response: {
      data: {
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            headers: [
              { name: "From", value: "Recruiter <jobs@example.com>" },
              { name: "Subject", value: "Interview invitation" },
            ],
            internalDate: "1787616000000",
            messageText:
              "<style>hidden</style><p>Hello <strong>candidate</strong></p><script>secret()</script>",
            snippet: "Interview next week",
          },
          { id: "message-2", subject: "Must be truncated" },
        ],
        nextPageToken: "next-page",
      },
    },
  });

  assert.equal(normalized.emails.length, 1);
  assert.deepEqual(normalized.emails[0], {
    cc: null,
    content: "Hello candidate",
    from: "Recruiter <jobs@example.com>",
    messageId: "message-1",
    receivedAt: "2026-08-25T00:00:00.000Z",
    snippet: "Interview next week",
    subject: "Interview invitation",
    threadId: "thread-1",
    to: null,
  });
  assert.equal(normalized.nextPageToken, "next-page");
  assert.equal(normalized.truncated, true);
});

test("HTML-only email links remain complete in the model-facing result, including after a long body", () => {
  const url = "https://accounts.example.test/verify?token=exact%2Ftoken&continue=%2Fjobs";
  const normalized = normalizeGmailSearchResponse({
    includeContent: true,
    maxResults: 1,
    response: { messages: [{
      id: "message-verification",
      body: `<p>${"Earlier email content. ".repeat(250)}</p><a href="${url.replace(/&/g, "&amp;")}"><strong>이메일 인증</strong></a><script>hidden()</script>`,
    }] },
  });
  const modelText = formatToolResultText(normalized);
  assert.ok(modelText.includes(`이메일 인증 (${url})`));
  assert.doesNotMatch(modelText, /<a |<strong>|hidden\(\)/);
  assert.equal(normalized.truncated, false);
});

test("plain email verification codes and URLs are retained while metadata-only reads omit the body", () => {
  const body = "Code: 000123. https://accounts.example.test/verify?token=a%2Bb&state=c";
  const response = { messages: [{ id: "message-code", messageText: body }] };
  const full = normalizeGmailSearchResponse({ includeContent: true, maxResults: 1, response });
  const metadata = normalizeGmailSearchResponse({ includeContent: false, maxResults: 1, response });
  assert.equal(full.emails[0].content, body);
  assert.equal("content" in metadata.emails[0], false);
});

test("normalizes live Composio sender, recipients, and preview body fields", () => {
  const normalized = normalizeGmailSearchResponse({
    includeContent: true,
    maxResults: 10,
    response: {
      messages: [
        {
          id: "message-live",
          messageTimestamp: "2026-08-25T03:00:00.000Z",
          preview: { body: "Your interview is confirmed." },
          sender: "Hiring Team <hiring@example.com>",
          subject: "Interview confirmed",
          thread_id: "thread-live",
          to: ["Candidate <candidate@example.com>"],
        },
      ],
    },
  });

  assert.deepEqual(normalized.emails[0], {
    cc: null,
    content: "Your interview is confirmed.",
    from: "Hiring Team <hiring@example.com>",
    messageId: "message-live",
    receivedAt: "2026-08-25T03:00:00.000Z",
    snippet: "Your interview is confirmed.",
    subject: "Interview confirmed",
    threadId: "thread-live",
    to: "Candidate <candidate@example.com>",
  });
  assert.equal(normalized.nextPageToken, null);
  assert.equal(normalized.truncated, false);
});


test("Gmail model projection preserves verification content and cursor without transport objects", () => {
  const result = { status: "ok" as const, assistantInstruction: "Returned messages only.", truncated: true, nextPageToken: "next-exact", emails: [{
    messageId: "verification", threadId: "thread", from: "login@example.test", to: null, cc: null,
    subject: "Verify email", receivedAt: "2026-10-30T03:00:00.000Z", snippet: "Code", content: "Code 000123. https://example.test/verify?token=exact%2Fvalue",
  }] };
  const text = formatToolResultText({ ...result, modelOutput: formatGmailSearchResult(result) });
  assert.match(text, /2026-10-30 12:00/);
  assert.match(text, /Code 000123/);
  assert.ok(text.includes("https://example.test/verify?token=exact%2Fvalue"));
  assert.match(text, /Next page token: next-exact/);
  assert.doesNotMatch(text, /\"emails\"|2026-10-30T|snippet:/);
});
