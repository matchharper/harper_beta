import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTalentCallNoteAnalysis,
  shouldAnalyzeTalentCallNote,
} from "./callNoteAnalysis";

const CALL_ID = "9de379c1-b735-42a6-8e92-3939b12e87f0";

test("parses a useful structured call note analysis", () => {
  assert.deepEqual(
    parseTalentCallNoteAnalysis({
      should_create: true,
      title: " 보상 기준 정리 ",
      key_points: [" 기본급을 우선한다. ", "실제 제안을 보며 기준을 조정한다."],
    }),
    {
      shouldCreate: true,
      title: "보상 기준 정리",
      keyPoints: ["기본급을 우선한다.", "실제 제안을 보며 기준을 조정한다."],
    }
  );
});

test("normalizes a do-not-create decision and rejects unusable output", () => {
  assert.deepEqual(
    parseTalentCallNoteAnalysis({
      should_create: false,
      title: "ignored",
      key_points: ["ignored"],
    }),
    { shouldCreate: false, title: "", keyPoints: [] }
  );
  assert.equal(
    parseTalentCallNoteAnalysis({
      should_create: true,
      title: "제목만 있음",
      key_points: [],
    }),
    null
  );
  assert.equal(parseTalentCallNoteAnalysis("not-json"), null);
});

test("only analyzes new post-onboarding calls with user speech", () => {
  const transcript = [{ role: "user" as const, text: "보상이 중요해요." }];

  assert.equal(
    shouldAnalyzeTalentCallNote({
      callId: CALL_ID,
      onboardingCompletedAtStart: true,
      transcript,
    }),
    true
  );
  assert.equal(
    shouldAnalyzeTalentCallNote({
      callId: CALL_ID,
      onboardingCompletedAtStart: false,
      transcript,
    }),
    false
  );
  assert.equal(
    shouldAnalyzeTalentCallNote({
      callId: null,
      onboardingCompletedAtStart: true,
      transcript,
    }),
    false
  );
  assert.equal(
    shouldAnalyzeTalentCallNote({
      callId: CALL_ID,
      onboardingCompletedAtStart: true,
      transcript: [{ role: "assistant", text: "안녕하세요." }],
    }),
    false
  );
});
