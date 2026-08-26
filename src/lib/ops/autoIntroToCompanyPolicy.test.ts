import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAutoIntroFollowUpPostscript,
  getAutoIntroReasonMode,
  getAutoIntroRoleSummaryDateKey,
  getFreshPendingConnectionSince,
  isAutoIntroRoleSummaryDay,
  wasAutoIntroSlackSent,
} from "./autoIntroToCompanyPolicy";

const NOW = new Date("2026-08-05T00:00:00.000Z");

function tag(tagName: string, updatedAt: string, id = updatedAt) {
  return {
    created_at: updatedAt,
    id,
    tag: tagName,
    updated_at: updatedAt,
  };
}

test("fresh latest pending connection stage is eligible", () => {
  assert.equal(
    getFreshPendingConnectionSince(
      [
        tag("내부:추천", "2026-08-01T00:00:00.000Z"),
        tag("내부:연결대기", "2026-08-04T00:00:00.000Z"),
      ],
      NOW
    ),
    "2026-08-04T00:00:00.000Z"
  );
});

test("pending connection at least fourteen days old is excluded", () => {
  assert.equal(
    getFreshPendingConnectionSince(
      [tag("내부:연결대기", "2026-07-22T00:00:00.000Z")],
      NOW
    ),
    null
  );
});

test("a newer non-pending internal stage excludes the candidate", () => {
  assert.equal(
    getFreshPendingConnectionSince(
      [
        tag("내부:연결대기", "2026-08-03T00:00:00.000Z"),
        tag("내부:연결됨", "2026-08-04T00:00:00.000Z"),
      ],
      NOW
    ),
    null
  );
});

test("fit kinds map to the required reason policy", () => {
  assert.equal(getAutoIntroReasonMode("codex"), "codex");
  assert.equal(getAutoIntroReasonMode(null), "author");
  assert.equal(getAutoIntroReasonMode("legacy-model"), "skip");
});

test("only successful Slack delivery metadata counts as contacted", () => {
  assert.equal(wasAutoIntroSlackSent({ deliveryStatus: "sent" }), true);
  assert.equal(wasAutoIntroSlackSent({ slackSent: true }), true);
  assert.equal(wasAutoIntroSlackSent({ deliveryStatus: "failed" }), false);
  assert.equal(wasAutoIntroSlackSent({ deliveryStatus: "pending" }), false);
});

test("role summary runs on Monday, Wednesday, and Friday in Asia/Seoul", () => {
  assert.equal(
    isAutoIntroRoleSummaryDay(new Date("2026-08-10T00:00:00.000Z")),
    true
  );
  assert.equal(
    isAutoIntroRoleSummaryDay(new Date("2026-08-12T00:00:00.000Z")),
    true
  );
  assert.equal(
    isAutoIntroRoleSummaryDay(new Date("2026-08-14T00:00:00.000Z")),
    true
  );
  assert.equal(
    isAutoIntroRoleSummaryDay(new Date("2026-08-13T00:00:00.000Z")),
    false
  );
  assert.equal(
    getAutoIntroRoleSummaryDateKey(new Date("2026-08-09T16:00:00.000Z")),
    "2026-08-10"
  );
});

test("optional follow-up postscript always ends as a question", () => {
  const postscript = buildAutoIntroFollowUpPostscript(
    "이 포지션에서 hands-on IC 경험을 더 우선하시나요"
  );
  assert.ok(postscript?.includes("상관없어요"));
  assert.ok(postscript?.endsWith("?"));
});
