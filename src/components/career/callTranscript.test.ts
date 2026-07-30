import assert from "node:assert/strict";
import test from "node:test";
import { finalizeAssistantTranscriptEntries } from "./callTranscript";
import type { CallTranscriptEntry } from "./types";

const ASSISTANT_PARTIAL: CallTranscriptEntry = {
  role: "assistant",
  text: "질문을",
  timestamp: "assistant-partial",
};
const USER_TRANSCRIPT: CallTranscriptEntry = {
  role: "user",
  text: "사용자 답변",
  timestamp: "user-final",
};

test("finalizes the streaming assistant even when a late user transcript is last", () => {
  const result = finalizeAssistantTranscriptEntries({
    entries: [ASSISTANT_PARTIAL, USER_TRANSCRIPT],
    text: "질문을 완료합니다.",
    timestamp: "assistant-final",
    wasStreaming: true,
  });

  assert.deepEqual(result, [
    {
      role: "assistant",
      text: "질문을 완료합니다.",
      timestamp: "assistant-final",
    },
    USER_TRANSCRIPT,
  ]);
});

test("keeps a delayed user transcript before the assistant response", () => {
  const result = finalizeAssistantTranscriptEntries({
    entries: [USER_TRANSCRIPT, ASSISTANT_PARTIAL],
    text: "질문을 완료합니다.",
    timestamp: "assistant-final",
    wasStreaming: true,
  });

  assert.deepEqual(result, [
    USER_TRANSCRIPT,
    {
      role: "assistant",
      text: "질문을 완료합니다.",
      timestamp: "assistant-final",
    },
  ]);
});

test("appends a non-streaming assistant transcript", () => {
  const result = finalizeAssistantTranscriptEntries({
    entries: [USER_TRANSCRIPT],
    text: "새 응답",
    timestamp: "assistant-final",
    wasStreaming: false,
  });

  assert.deepEqual(result, [
    USER_TRANSCRIPT,
    {
      role: "assistant",
      text: "새 응답",
      timestamp: "assistant-final",
    },
  ]);
});
