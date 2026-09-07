import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkGmailCareerThreads,
  compactGmailCareerThreads,
  type GmailCareerSourceEmail,
} from "./gmailCareerHistoryInput";

function email(
  value: Partial<GmailCareerSourceEmail> &
    Pick<GmailCareerSourceEmail, "messageId">
): GmailCareerSourceEmail {
  return {
    cc: null,
    from: "Recruiting <recruiting@example.com>",
    receivedAt: "2026-01-01T12:00:00.000Z",
    snippet: null,
    subject: "Application update",
    threadId: "thread-1",
    to: "candidate@example.com",
    ...value,
  };
}

test("compacts repeated thread content and tracking URLs before analysis", () => {
  const previous = "Your interview is confirmed for Tuesday at 3 PM.";
  const result = compactGmailCareerThreads({
    emails: [
      email({ content: previous, messageId: "message-1" }),
      email({
        content: `Thanks, see details at https://example.com/schedule?tracking=${"x".repeat(500)}. On Monday, Recruiter <recruiting@example.com> wrote: ${previous}`,
        messageId: "message-2",
        receivedAt: "2026-01-02T12:00:00.000Z",
      }),
    ],
    mailboxEmail: "candidate@example.com",
    maxBodyCharacters: 2_400,
    maxMessages: 500,
  });

  assert.equal(result.threads.length, 1);
  assert.equal(result.threads[0]?.messages.length, 2);
  assert.equal(
    result.threads[0]?.messages[1]?.body,
    "Thanks, see details at example.com/schedule."
  );
  assert.doesNotMatch(JSON.stringify(result.threads), /tracking=/);
});

test("keeps the newest messages and emits chunks within the exact limit", () => {
  const mailboxOwner = { email: "candidate@example.com", name: "Candidate" };
  const maxPayloadCharacters = 1_000;
  const result = compactGmailCareerThreads({
    emails: Array.from({ length: 8 }, (_, index) =>
      email({
        content: `${index}-${"a".repeat(180)}`,
        messageId: `message-${index}`,
        receivedAt: `2026-01-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
        threadId: `thread-${index}`,
      })
    ),
    mailboxEmail: mailboxOwner.email,
    maxBodyCharacters: 2_400,
    maxMessages: 5,
  });
  const emptyPayloadCharacters = JSON.stringify({
    mailboxOwner,
    threads: [],
  }).length;
  const chunks = chunkGmailCareerThreads({
    maxCharacters: maxPayloadCharacters - emptyPayloadCharacters + 2,
    threads: result.threads,
  });

  assert.equal(result.selectedMessageCount, 5);
  assert.deepEqual(
    result.threads.flatMap((thread) =>
      thread.messages.map((message) => message.id)
    ),
    ["message-3", "message-4", "message-5", "message-6", "message-7"]
  );
  assert.ok(chunks.length > 1);
  assert.ok(
    chunks.every(
      (chunk) =>
        JSON.stringify({ mailboxOwner, threads: chunk }).length <=
        maxPayloadCharacters
    ),
    "every LLM email payload must stay within the configured character cap"
  );
});
