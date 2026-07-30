import assert from "node:assert/strict";
import test from "node:test";
import {
  beginXaiSpeech,
  completeXaiResponse,
  createXaiTranscriptTurnState,
  markXaiAssistantOutputStarted,
  markXaiResponseCreated,
  queueXaiCompletedTranscript,
} from "@/lib/career/xaiTranscriptTurn";

test("keeps replacing cumulative transcripts across pauses in one user turn", () => {
  let state = beginXaiSpeech(createXaiTranscriptTurnState()).transition.state;

  const firstTranscript = queueXaiCompletedTranscript(state, {
    itemId: "segment-1",
    text: "말을 하다가",
  });
  assert.equal(firstTranscript.deliveredTranscript, null);
  state = firstTranscript.state;

  const continuedSpeech = beginXaiSpeech(state);
  assert.equal(continuedSpeech.continuesCurrentUserTurn, true);
  assert.equal(continuedSpeech.transition.deliveredTranscript, null);

  state = queueXaiCompletedTranscript(continuedSpeech.transition.state, {
    itemId: "segment-2",
    text: "말을 하다가 잠깐 멈췄다가 다시 말했습니다.",
  }).state;

  const completed = completeXaiResponse(state, "completed");
  assert.equal(
    completed.deliveredTranscript?.text,
    "말을 하다가 잠깐 멈췄다가 다시 말했습니다."
  );
  assert.equal(completed.state.pendingTranscript, null);
});

test("starts a new user turn after assistant output and flushes the prior transcript", () => {
  let state = beginXaiSpeech(createXaiTranscriptTurnState()).transition.state;
  state = queueXaiCompletedTranscript(state, {
    itemId: "user-1",
    text: "첫 번째 답변",
  }).state;
  state = markXaiAssistantOutputStarted(state);

  const nextSpeech = beginXaiSpeech(state);

  assert.equal(nextSpeech.continuesCurrentUserTurn, false);
  assert.equal(nextSpeech.transition.deliveredTranscript?.text, "첫 번째 답변");
  assert.equal(nextSpeech.transition.state.turnId, 2);
});

test("delivers a late transcript immediately after its response completed", () => {
  let state = beginXaiSpeech(createXaiTranscriptTurnState()).transition.state;
  state = markXaiResponseCreated(state);
  state = completeXaiResponse(state, "completed").state;

  const lateTranscript = queueXaiCompletedTranscript(state, {
    itemId: "late-user-transcript",
    text: "늦게 도착한 답변",
  });

  assert.equal(lateTranscript.deliveredTranscript?.text, "늦게 도착한 답변");
});

test("does not close a user turn for a cancelled response without output", () => {
  let state = beginXaiSpeech(createXaiTranscriptTurnState()).transition.state;
  state = queueXaiCompletedTranscript(state, {
    itemId: "segment-1",
    text: "이어 말할 문장",
  }).state;
  state = completeXaiResponse(state, "cancelled").state;

  const continuedSpeech = beginXaiSpeech(state);

  assert.equal(continuedSpeech.continuesCurrentUserTurn, true);
  assert.equal(continuedSpeech.transition.deliveredTranscript, null);
});
