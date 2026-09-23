import assert from "node:assert/strict";
import test from "node:test";

import {
  buildConversationSummaryBatch,
  CONVERSATION_SUMMARY_MESSAGE_TRIGGER,
  CONVERSATION_SUMMARY_SOURCE_TOKEN_TRIGGER,
  countConversationSummaryTokens,
} from "./conversationSummaryPolicy";

test("counts rendered text with the conversation-summary tokenizer", () => {
  assert.ok(countConversationSummaryTokens("안녕하세요. Harper입니다.") > 0);
  assert.equal(countConversationSummaryTokens("   "), 0);
});

test("waits below both the token and message thresholds", () => {
  const result = buildConversationSummaryBatch({
    items: Array.from(
      { length: CONVERSATION_SUMMARY_MESSAGE_TRIGGER - 1 },
      (_, index) => `short-${index}`
    ),
    renderItem: (item) => item,
  });

  assert.equal(result.triggered, false);
  assert.equal(result.items.length, CONVERSATION_SUMMARY_MESSAGE_TRIGGER - 1);
  assert.ok(
    result.sourceTokenCount < CONVERSATION_SUMMARY_SOURCE_TOKEN_TRIGGER
  );
});

test("caps a short-message batch at 24 messages", () => {
  const result = buildConversationSummaryBatch({
    items: Array.from({ length: 40 }, (_, index) => `short-${index}`),
    renderItem: (item) => item,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.triggerReason, "messages");
  assert.equal(result.items.length, CONVERSATION_SUMMARY_MESSAGE_TRIGGER);
});

test("summarizes a long source before the message cap", () => {
  const result = buildConversationSummaryBatch({
    items: ["career coaching context ".repeat(6_000), "unreached"],
    renderItem: (item) => item,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.triggerReason, "tokens");
  assert.equal(result.items.length, 1);
  assert.ok(
    result.sourceTokenCount >= CONVERSATION_SUMMARY_SOURCE_TOKEN_TRIGGER
  );
});
