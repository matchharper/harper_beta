import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLatestOpsTalentProfileMemoPreviewMap,
  type OpsTalentProfileMemoCandidate,
} from "./talentMemo";

function candidate(
  overrides: Partial<OpsTalentProfileMemoCandidate> = {}
): OpsTalentProfileMemoCandidate {
  return {
    content: "메모",
    occurredAt: "2026-09-08T00:00:00.000Z",
    talentId: "talent-1",
    ...overrides,
  };
}

test("chooses the newest talent profile memo", () => {
  const latest = buildLatestOpsTalentProfileMemoPreviewMap([
    candidate({
      content: "이전 메모",
      occurredAt: "2026-09-08T01:00:00.000Z",
    }),
    candidate({
      content: "최근 메모",
      occurredAt: "2026-09-08T02:00:00.000Z",
    }),
  ]).get("talent-1");

  assert.equal(latest?.content, "최근 메모");
});

test("normalizes content and ignores empty candidates", () => {
  const latest = buildLatestOpsTalentProfileMemoPreviewMap([
    candidate({ content: "   ", occurredAt: "2026-09-08T03:00:00.000Z" }),
    candidate({ content: `  ${"a".repeat(260)}  ` }),
  ]).get("talent-1");

  assert.equal(latest?.content.length, 240);
  assert.equal(latest?.content, "a".repeat(240));
});
