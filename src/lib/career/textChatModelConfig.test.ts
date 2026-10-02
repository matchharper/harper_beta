import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_SOL_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
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
  assert.equal(isCareerTextChatModelId(OPENROUTER_MUSE_SPARK_13_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_6_LUNA_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_61_SOL_MODEL), true);
  assert.equal(isCareerTextChatModelId("grok-4.3"), false);
});

test("uses Sonnet 5.5 by default and maps model-specific reasoning effort", () => {
  assert.equal(DEFAULT_CAREER_TEXT_CHAT_MODEL, "claude-sonnet-5-5");
  assert.deepEqual(resolveCareerTextChatModel("unsupported"), {
    model: CLAUDE_MODEL,
  });
  assert.deepEqual(resolveCareerTextChatModel(OPENROUTER_GLM_53_FLASH_MODEL), {
    chatCompletionReasoningEffort: "high",
    model: OPENROUTER_GLM_53_FLASH_MODEL,
  });
  assert.deepEqual(resolveCareerTextChatModel(OPENROUTER_MUSE_SPARK_13_MODEL), {
    chatCompletionReasoningEffort: "xhigh",
    model: OPENROUTER_MUSE_SPARK_13_MODEL,
  });
  assert.deepEqual(resolveCareerTextChatModel(GPT_6_LUNA_MODEL), {
    model: GPT_6_LUNA_MODEL,
    openAIResponsesReasoningEffort: "xhigh",
  });
  assert.deepEqual(resolveCareerTextChatModel(GPT_61_SOL_MODEL), {
    model: GPT_61_SOL_MODEL,
    openAIResponsesReasoningEffort: "high",
  });
});

test("ignores a per-request model override without dev-control access", () => {
  assert.deepEqual(
    resolveCareerTextChatModelForRequest(OPENROUTER_GLM_53_FLASH_MODEL, false),
    {
      model: CLAUDE_MODEL,
    }
  );
  assert.equal(
    resolveCareerTextChatModelForRequest(OPENROUTER_GLM_53_FLASH_MODEL, true)
      .model,
    OPENROUTER_GLM_53_FLASH_MODEL
  );
});
