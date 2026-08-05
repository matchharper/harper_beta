import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGeneratedTalentInsightEntry } from "./insights";

test("does not reject an insight based on a profile-row-like key name", () => {
  assert.deepEqual(
    normalizeGeneratedTalentInsightEntry({
      rawKey: "representative_experience",
      rawValue: "결제 시스템 구축 경험을 대표 경험으로 강조하고 싶어합니다.",
    }),
    {
      key: "representative_experience",
      ok: true,
      value: "결제 시스템 구축 경험을 대표 경험으로 강조하고 싶어합니다.",
    }
  );
});

test("continues to reject malformed insight keys", () => {
  assert.deepEqual(
    normalizeGeneratedTalentInsightEntry({
      rawKey: "Representative Experience",
      rawValue: "대표 경험입니다.",
    }),
    {
      key: "Representative Experience",
      ok: false,
      reason: "invalid_english_snake_case_key",
    }
  );
});
