import assert from "node:assert/strict";
import test from "node:test";
import {
  CAREER_LIVE_MODEL,
  CAREER_REALTIME_MODEL,
  resolveCareerVoiceModel,
} from "@/lib/career/voiceModel";

test("keeps GPT-Realtime 2.1 as the default Career voice model", () => {
  assert.equal(resolveCareerVoiceModel(), CAREER_REALTIME_MODEL);
  assert.equal(resolveCareerVoiceModel(null), CAREER_REALTIME_MODEL);
});

test("selects GPT-Live 1 only for its explicit model override", () => {
  assert.equal(resolveCareerVoiceModel(CAREER_LIVE_MODEL), CAREER_LIVE_MODEL);
  assert.equal(
    resolveCareerVoiceModel(CAREER_REALTIME_MODEL),
    CAREER_REALTIME_MODEL
  );
  assert.equal(resolveCareerVoiceModel("xai"), CAREER_REALTIME_MODEL);
});
