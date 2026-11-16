import assert from "node:assert/strict";
import test from "node:test";
import { gtmInviteFirstScreenSeenKey, shortPostingSummary } from "./inviteFirstScreen";

test("markdown becomes plain text", () => {
  assert.equal(
    shortPostingSummary("## About the role\n\n- Build the **payment** backend\n- Run [our API](https://example.com)\n"),
    "Build the payment backend Run our API",
  );
  assert.equal(shortPostingSummary(null), "");
  assert.equal(shortPostingSummary("   "), "");
});

test("a long posting is cut at a sentence end", () => {
  const text = "결제 백엔드를 만들고 운영해요. 하루 수백만 건의 결제를 안정적으로 처리하는 시스템을 함께 키워 갈 분을 찾고 있어요. 팀은 열 명이고 서울에서 일해요.";
  assert.equal(shortPostingSummary(text, 70), "결제 백엔드를 만들고 운영해요. 하루 수백만 건의 결제를 안정적으로 처리하는 시스템을 함께 키워 갈 분을 찾고 있어요.");
  assert.equal(shortPostingSummary("Build the payment backend. Own its reliability and scale. Work with a small team.", 60), "Build the payment backend. Own its reliability and scale.");
});

test("one long sentence is cut at a word with an ellipsis", () => {
  const text = "We are looking for a backend engineer who has built and operated payment systems with high reliability and low latency";
  const cut = shortPostingSummary(text, 60);
  assert.ok(cut.endsWith("…"));
  assert.ok(cut.length <= 61);
  assert.ok(!cut.slice(0, -1).endsWith(" "));
});

test("the seen key is per mail", () => {
  assert.equal(gtmInviteFirstScreenSeenKey("abc"), "harper:gtm-invite-first-screen:abc");
});
