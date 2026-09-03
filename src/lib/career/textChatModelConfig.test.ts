import assert from "node:assert/strict";
import test from "node:test";
import {
  GPT_56_LUNA_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
} from "@/lib/llm/modelConfig";
import {
  DEFAULT_CAREER_TEXT_CHAT_MODEL,
  isCareerTextChatModelId,
  resolveCareerTextChatModel,
  resolveCareerTextChatModelForRequest,
} from "./textChatModelConfig";

test("allows only the Career dev-control text chat models", () => {
  assert.equal(isCareerTextChatModelId(DEFAULT_CAREER_TEXT_CHAT_MODEL), true);
  assert.equal(isCareerTextChatModelId(OPENROUTER_GLM_53_FLASH_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_56_LUNA_MODEL), true);
  assert.equal(isCareerTextChatModelId("grok-4.3"), false);
});

test("uses Sonnet by default and maps model-specific reasoning effort", () => {
  assert.deepEqual(resolveCareerTextChatModel("unsupported"), {
    model: DEFAULT_CAREER_TEXT_CHAT_MODEL,
  });
  assert.deepEqual(resolveCareerTextChatModel(OPENROUTER_GLM_53_FLASH_MODEL), {
    chatCompletionReasoningEffort: "high",
    model: OPENROUTER_GLM_53_FLASH_MODEL,
  });
  assert.deepEqual(resolveCareerTextChatModel(GPT_56_LUNA_MODEL), {
    model: GPT_56_LUNA_MODEL,
    openAIResponsesReasoningEffort: "xhigh",
  });
});

test("ignores a per-request model override without dev-control access", () => {
  assert.deepEqual(
    resolveCareerTextChatModelForRequest(OPENROUTER_GLM_53_FLASH_MODEL, false),
    { model: DEFAULT_CAREER_TEXT_CHAT_MODEL }
  );
  assert.equal(
    resolveCareerTextChatModelForRequest(OPENROUTER_GLM_53_FLASH_MODEL, true)
      .model,
    OPENROUTER_GLM_53_FLASH_MODEL
  );
});
