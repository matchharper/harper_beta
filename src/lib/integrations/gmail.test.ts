import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGmailSearchResponse } from "./gmail";

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
