import assert from "node:assert/strict";
import test from "node:test";

import { buildSavedProfileChangesForExtractor } from "./profileChangesForExtractor";

test("hands the extractor only profile changes reported as successfully applied", () => {
  const summary = buildSavedProfileChangesForExtractor({
    input: {
      talentUser: {
        bio: "제품과 엔지니어링을 함께 이끕니다.",
        location: "서울",
      },
      rowMemos: [
        {
          memo: "결제 플랫폼의 초기 설계를 주도했다.",
          operation: "append",
          rowId: "experience-1",
          type: "experience",
        },
        {
          memo: "이 내용은 저장에 실패했다.",
          operation: "append",
          rowId: "experience-2",
          type: "experience",
        },
      ],
    },
    result: {
      ok: true,
      updatedRowMemos: {
        educations: [],
        experiences: ["experience-1"],
        extras: [],
      },
      updatedTalentUserFields: ["location"],
    },
  });

  assert.match(summary, /Profile location: 서울/);
  assert.match(summary, /결제 플랫폼의 초기 설계를 주도했다/);
  assert.doesNotMatch(summary, /제품과 엔지니어링/);
  assert.doesNotMatch(summary, /저장에 실패했다/);
});

test("includes applied personal links but excludes recommendation settings", () => {
  const summary = buildSavedProfileChangesForExtractor({
    input: { recommendationBatchSize: 7 },
    result: {
      ok: true,
      updatedProfileLinks: {
        added: ["https://example.com/me"],
        deleted: ["https://example.com/old"],
      },
      updatedRecommendationSettings: ["recommendationBatchSize"],
    },
  });

  assert.match(summary, /Profile link added: https:\/\/example\.com\/me/);
  assert.match(summary, /Profile link deleted: https:\/\/example\.com\/old/);
  assert.doesNotMatch(summary, /recommendationBatchSize|7/);
});

test("returns no handoff for a failed or unchanged profile call", () => {
  assert.equal(
    buildSavedProfileChangesForExtractor({
      input: { talentUser: { location: "서울" } },
      result: { ok: false, updatedTalentUserFields: ["location"] },
    }),
    ""
  );
  assert.equal(
    buildSavedProfileChangesForExtractor({
      input: { talentUser: { location: "서울" } },
      result: { ok: true, updatedTalentUserFields: [] },
    }),
    ""
  );
});

test("bounds the per-turn profile handoff instead of repeating a large profile edit", () => {
  const summary = buildSavedProfileChangesForExtractor({
    input: {
      rowMemos: Array.from({ length: 10 }, (_, index) => ({
        memo: `${index}-${"긴 메모 ".repeat(200)}`,
        operation: "append",
        rowId: `experience-${index}`,
        type: "experience",
      })),
    },
    result: {
      ok: true,
      updatedRowMemos: {
        educations: [],
        experiences: Array.from(
          { length: 10 },
          (_, index) => `experience-${index}`
        ),
        extras: [],
      },
    },
  });

  assert.ok(summary.length <= 2400);
  assert.match(summary, /…$/);
});
