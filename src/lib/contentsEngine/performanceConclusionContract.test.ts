import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeContentPerformanceConclusion,
} from "@/lib/contentsEngine/performanceConclusionContract";

test("accepts a compact supported performance conclusion", () => {
  assert.deepEqual(
    normalizeContentPerformanceConclusion({
      rating: "good",
      reason: "비교 콘텐츠보다 조회수와 댓글 반응이 강함",
    }),
    {
      rating: "good",
      reason: "비교 콘텐츠보다 조회수와 댓글 반응이 강함",
    }
  );
});

test("rejects unsupported ratings and multiline reasons", () => {
  assert.throws(() =>
    normalizeContentPerformanceConclusion({ rating: "excellent", reason: "좋음" })
  );
  assert.throws(() =>
    normalizeContentPerformanceConclusion({ rating: "mixed", reason: "첫 줄\n둘째 줄" })
  );
});
