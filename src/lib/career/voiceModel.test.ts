import assert from "node:assert/strict";
import test from "node:test";
import {
  assignCareerVoiceModel,
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

test("assigns each Career user to one stable voice model", () => {
  const userId = "36b21d39-6446-4370-a596-7a3d61f2fb42";
  const first = assignCareerVoiceModel(userId);

  assert.equal(assignCareerVoiceModel(userId), first);
  assert.equal(assignCareerVoiceModel(userId.toUpperCase()), first);
  assert.ok(first === CAREER_REALTIME_MODEL || first === CAREER_LIVE_MODEL);
  assert.equal(resolveCareerVoiceModel(null, userId), first);
});

test("splits representative user identifiers approximately 50:50", () => {
  const counts = new Map([
    [CAREER_REALTIME_MODEL, 0],
    [CAREER_LIVE_MODEL, 0],
  ]);

  for (let index = 0; index < 10_000; index += 1) {
    const model = assignCareerVoiceModel(`voice-experiment-user-${index}`);
    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  const realtimeShare = (counts.get(CAREER_REALTIME_MODEL) ?? 0) / 10_000;
  assert.ok(realtimeShare > 0.48 && realtimeShare < 0.52);
});

test("keeps explicit developer overrides above the experiment assignment", () => {
  const realtimeUser = Array.from({ length: 1_000 }, (_, index) =>
    `realtime-override-user-${index}`
  ).find(
    (userId) => assignCareerVoiceModel(userId) === CAREER_LIVE_MODEL
  );
  const liveUser = Array.from({ length: 1_000 }, (_, index) =>
    `live-override-user-${index}`
  ).find(
    (userId) => assignCareerVoiceModel(userId) === CAREER_REALTIME_MODEL
  );

  assert.ok(realtimeUser);
  assert.ok(liveUser);
  assert.equal(
    resolveCareerVoiceModel(CAREER_REALTIME_MODEL, realtimeUser),
    CAREER_REALTIME_MODEL
  );
  assert.equal(
    resolveCareerVoiceModel(CAREER_LIVE_MODEL, liveUser),
    CAREER_LIVE_MODEL
  );
});
