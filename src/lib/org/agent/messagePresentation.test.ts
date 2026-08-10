import assert from "node:assert/strict";
import test from "node:test";
import { formatOrgChatMessageTime } from "@/lib/org/agent/messagePresentation";

const now = new Date(2026, 7, 10, 16, 30);

test("shows only time for messages sent today", () => {
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 10, 9, 5).toISOString(), now),
    "09:05"
  );
});

test("prefixes yesterday and uses calendar-day distance for older messages", () => {
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 9, 23, 55).toISOString(), now),
    "어제 23:55"
  );
  assert.equal(
    formatOrgChatMessageTime(new Date(2026, 7, 7, 18, 0).toISOString(), now),
    "3일전"
  );
});

test("hides invalid message timestamps", () => {
  assert.equal(formatOrgChatMessageTime("not-a-date", now), "");
});
