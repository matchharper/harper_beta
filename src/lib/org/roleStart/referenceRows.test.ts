import assert from "node:assert/strict";
import test from "node:test";
import { likedAnswer, referenceLink, referenceRowOf } from "./referenceRows";

test("a 참고 인물 row needs a link or a profile; 마음에 든 점 alone is not one", () => {
  assert.equal(referenceRowOf({ url: "", text: "  ", liked: "다룬 기술" }), null);
  assert.equal(referenceRowOf({}), null);
  assert.equal(referenceRowOf(null), null);
  assert.deepEqual(referenceRowOf({ url: "example.com/in/someone", liked: "" }), { url: "https://example.com/in/someone", text: null, liked: null });
  assert.deepEqual(referenceRowOf({ text: "결제 시스템을 운영했어요." }), { url: null, text: "결제 시스템을 운영했어요.", liked: null });
});

test("a link that is not http(s) is no link", () => {
  assert.equal(referenceLink("javascript:alert(1)"), null);
  assert.equal(referenceLink("not a link"), null);
  assert.equal(referenceRowOf({ url: "ftp://example.com/x" }), null);
});

test("the liked answer is the picked chips, then the team's words", () => {
  assert.equal(likedAnswer(["다룬 기술", "일하는 방식"], " 대규모 트래픽 경험 "), "다룬 기술, 일하는 방식 / 대규모 트래픽 경험");
  assert.equal(likedAnswer([], "대규모 트래픽 경험"), "대규모 트래픽 경험");
  assert.equal(likedAnswer(["다룬 기술"], ""), "다룬 기술");
});
