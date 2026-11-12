import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_LIVE_MODEL,
  CAREER_REALTIME_MODEL,
  resolveCareerVoiceModel,
} from "@/lib/career/voiceModel";

test("defaults Career voice to GPT-Live without an experiment assignment", () => {
  for (const override of [undefined, null, "", "unknown"]) {
    assert.equal(resolveCareerVoiceModel(override), CAREER_LIVE_MODEL);
  }
});

test("preserves explicit Realtime and Live overrides", () => {
  assert.equal(resolveCareerVoiceModel(CAREER_REALTIME_MODEL), CAREER_REALTIME_MODEL);
  assert.equal(resolveCareerVoiceModel(CAREER_LIVE_MODEL), CAREER_LIVE_MODEL);
  assert.equal(resolveCareerVoiceModel(" GPT-REALTIME-2.1 "), CAREER_REALTIME_MODEL);
});
