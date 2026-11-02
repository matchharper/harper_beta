import assert from "node:assert/strict";
import test from "node:test";
import { formatOpportunityFeedbackPromptContext } from "./activityEvents";

test("feedback context preserves source facts, every supplied event and formatted times", () => {
  const reason = "저번 주에 지원했어. 회사는 좋아하지만 이 공고는 이미 닫혔네.";
  const items = Array.from({ length: 10 }, (_, i) => ({ action: "negative" as const, createdAt: "2026-08-26T01:02:03.000Z", eventId: `event-${i}`, summary: reason, fitSummary: "Public role context", hasFeedbackReason: true }));
  const prompt = formatOpportunityFeedbackPromptContext(items);
  for (const item of items) assert.ok(prompt.includes(item.eventId));
  assert.ok(prompt.includes(reason));
  assert.ok(prompt.includes("2026-08-26 10:02"));
  assert.ok(prompt.includes("Asia/Seoul"));
  assert.ok(prompt.includes("Public role context"));
  assert.ok(!prompt.includes("2026-08-26T"));
  assert.ok(!prompt.includes("Operational feedback exception"));
});

test("feedback does not inject a semantic branch for selected reason keywords", () => {
  const item = { action: "positive" as const, createdAt: "2026-10-30T07:00:00Z", eventId: "same", summary: "이미 지원했던 회사/역할입니다." };
  const withLegacyCategory = formatOpportunityFeedbackPromptContext([{ ...item, operationalFeedbackKinds: ["already_applied"] }]);
  assert.equal(withLegacyCategory, formatOpportunityFeedbackPromptContext([item]));
  assert.equal(formatOpportunityFeedbackPromptContext([]), "");
});
