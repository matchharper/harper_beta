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
    content: "Hello candidate",
    from: "Recruiter <jobs@example.com>",
    messageId: "message-1",
    receivedAt: "2026-08-25T00:00:00.000Z",
    snippet: "Interview next week",
    subject: "Interview invitation",
    threadId: "thread-1",
  });
  assert.equal(normalized.truncated, true);
});
