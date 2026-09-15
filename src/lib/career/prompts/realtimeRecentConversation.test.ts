import assert from "node:assert/strict";
import test from "node:test";

import { buildCareerRealtimeRecentConversationSection } from "./realtimeRecentConversation";

test("uses the shared localized message-time rules for realtime context", () => {
  const section = buildCareerRealtimeRecentConversationSection(
    [
      {
        content: "Recent message",
        createdAt: "2026-09-14T11:30:01.000Z",
        role: "user",
      },
      {
        content: "Older message",
        createdAt: "2026-09-12T12:00:00.000Z",
        role: "assistant",
      },
    ],
    "en",
    "America/New_York",
    new Date("2026-09-14T12:00:00.000Z")
  );

  assert.match(section, /- User: Recent message/);
  assert.match(section, /- \[2 days ago\] Harper: Older message/);
});
