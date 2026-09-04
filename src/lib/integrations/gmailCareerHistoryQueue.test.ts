import assert from "node:assert/strict";
import test from "node:test";
import { parseGmailCareerHistoryQueueMessage } from "./gmailCareerHistoryQueueMessage";

test("accepts only versioned Gmail analysis queue messages", () => {
  const message = parseGmailCareerHistoryQueueMessage({
    expectedIntegrationUpdatedAt: "2026-08-30T00:00:00.000Z",
    kind: "analyze_gmail_career_history",
    talentId: "cb0a949a-a956-4ec6-864d-12e4eafc3693",
    version: 1,
  });
  assert.deepEqual(message, {
    expectedIntegrationUpdatedAt: "2026-08-30T00:00:00.000Z",
    kind: "analyze_gmail_career_history",
    talentId: "cb0a949a-a956-4ec6-864d-12e4eafc3693",
    version: 1,
  });

  assert.equal(
    parseGmailCareerHistoryQueueMessage({
      expectedIntegrationUpdatedAt: "invalid",
      kind: "analyze_gmail_career_history",
      talentId: "talent-a",
      version: 1,
    }),
    null
  );
  assert.equal(
    parseGmailCareerHistoryQueueMessage({
      expectedIntegrationUpdatedAt: "2026-08-30T00:00:00.000Z",
      kind: "other",
      talentId: "cb0a949a-a956-4ec6-864d-12e4eafc3693",
      version: 1,
    }),
    null
  );
});
