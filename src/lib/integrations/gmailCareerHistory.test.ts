import assert from "node:assert/strict";
import test from "node:test";
import {
  dedupGmailEmailsByThread,
  normalizeGmailCareerEntries,
  renderGmailCareerHistoryMarkdown,
} from "./gmailCareerHistoryCore";

test("normalizes, deduplicates, and orders Gmail career entries", () => {
  const entries = normalizeGmailCareerEntries({
    entries: [
      {
        company: "Acme",
        confidence: "medium",
        evidenceSummary: "Application confirmation",
        lastActivityAt: "2026-01-01T00:00:00.000Z",
        role: "Engineer",
        stage: "applied",
      },
      {
        company: " Acme ",
        confidence: "high",
        evidenceSummary: "Interview scheduling email",
        lastActivityAt: "2026-02-01T00:00:00.000Z",
        role: "Engineer",
        stage: "interview",
      },
      {
        company: "Beta Labs",
        confidence: "unexpected",
        evidenceSummary: "Recruiter message",
        lastActivityAt: "not-a-date",
        role: null,
        stage: "unexpected",
      },
      {
        company: "",
        confidence: "high",
        evidenceSummary: "Must be ignored",
        lastActivityAt: null,
        role: null,
        stage: "offer",
      },
    ],
  });

  assert.deepEqual(entries, [
    {
      company: "Acme",
      confidence: "high",
      evidenceSummary: "Interview scheduling email",
      lastActivityAt: "2026-02-01T00:00:00.000Z",
      role: "Engineer",
      stage: "interview",
    },
    {
      company: "Beta Labs",
      confidence: "low",
      evidenceSummary: "Recruiter message",
      lastActivityAt: null,
      role: null,
      stage: "unknown",
    },
  ]);
});

test("renders a bounded evidence summary without raw email bodies", () => {
  const markdown = renderGmailCareerHistoryMarkdown({
    analyzedAt: "2026-08-30T00:00:00.000Z",
    entries: [
      {
        company: "Acme",
        confidence: "high",
        evidenceSummary: "Interview scheduling and follow-up messages",
        lastActivityAt: "2026-02-01T00:00:00.000Z",
        role: "Engineer",
        stage: "interview",
      },
    ],
  });

  assert.match(markdown, /^# Career history from Gmail/m);
  assert.match(markdown, /## Acme — Engineer/);
  assert.match(markdown, /Last known stage: Interview/);
  assert.match(markdown, /Confidence: High/);
  assert.match(markdown, /does not contain raw email bodies/);
});

test("renders an explicit empty result instead of inventing history", () => {
  const markdown = renderGmailCareerHistoryMarkdown({
    analyzedAt: "2026-08-30T00:00:00.000Z",
    entries: [],
  });

  assert.match(markdown, /No reliable application history found/);
  assert.doesNotMatch(markdown, /^## .* — /m);
});

test("keeps only the latest message per Gmail thread", () => {
  const emails = [
    {
      messageId: "m1",
      receivedAt: "2026-01-01T00:00:00.000Z",
      threadId: "t-acme",
    },
    {
      messageId: "m2",
      receivedAt: "2026-03-01T00:00:00.000Z",
      threadId: "t-acme",
    },
    {
      messageId: "m3",
      receivedAt: "2026-02-15T00:00:00.000Z",
      threadId: "t-beta",
    },
    {
      messageId: "m4",
      receivedAt: "2026-04-01T00:00:00.000Z",
      threadId: null,
    },
    {
      messageId: "m5",
      receivedAt: null,
      threadId: "",
    },
  ];

  const deduped = dedupGmailEmailsByThread(emails);

  assert.deepEqual(
    deduped.map((email) => email.messageId),
    ["m4", "m2", "m3", "m5"]
  );
});

test("treats missing receivedAt as older when deduping", () => {
  const emails = [
    {
      messageId: "m-null",
      receivedAt: null,
      threadId: "t-1",
    },
    {
      messageId: "m-dated",
      receivedAt: "2026-05-01T00:00:00.000Z",
      threadId: "t-1",
    },
  ];

  const deduped = dedupGmailEmailsByThread(emails);
  assert.deepEqual(
    deduped.map((email) => email.messageId),
    ["m-dated"]
  );
});
