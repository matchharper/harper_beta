import assert from "node:assert/strict";
import test from "node:test";
import {
  CLAUDE_HAIKU_MODEL,
  GPT_6_LUNA_MODEL,
  GPT_61_SOL_MODEL,
  GPT_61_SOL_ULTRAFAST_MODEL,
  GPT_61_TERRA_MODEL,
  OPENROUTER_GLM_53_FLASH_MODEL,
  OPENROUTER_MUSE_SPARK_13_MODEL,
} from "@/lib/llm/modelConfig";
import {
  DEFAULT_CAREER_TEXT_CHAT_MODEL,
  isCareerTextChatModelId,
  resolveCareerTextChatModel,
  resolveCareerTextChatModelForRequest,
  readCareerSourceTextChatModel,
} from "./textChatModelConfig";

test("allows only the Career dev-control text chat models", () => {
  assert.equal(isCareerTextChatModelId(DEFAULT_CAREER_TEXT_CHAT_MODEL), true);
  assert.equal(isCareerTextChatModelId(OPENROUTER_GLM_53_FLASH_MODEL), true);
  assert.equal(isCareerTextChatModelId(OPENROUTER_MUSE_SPARK_13_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_6_LUNA_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_61_SOL_MODEL), true);
  assert.equal(isCareerTextChatModelId(GPT_61_SOL_ULTRAFAST_MODEL), true);
  assert.equal(isCareerTextChatModelId("grok-4.3"), false);
});

test("uses GPT-6.1 Terra high by default and maps model-specific reasoning effort", () => {
  assert.equal(DEFAULT_CAREER_TEXT_CHAT_MODEL, GPT_61_TERRA_MODEL);
  assert.deepEqual(resolveCareerTextChatModel("unsupported"), {
    model: GPT_61_TERRA_MODEL,
    openAIResponsesReasoningEffort: "high",
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
  assert.deepEqual(resolveCareerTextChatModel(GPT_61_SOL_ULTRAFAST_MODEL), {
    model: GPT_61_SOL_ULTRAFAST_MODEL,
    openAIResponsesReasoningEffort: "high",
  });
});

test("ignores a per-request model override without dev-control access", () => {
  for (const model of [CLAUDE_HAIKU_MODEL, OPENROUTER_GLM_53_FLASH_MODEL, GPT_61_SOL_ULTRAFAST_MODEL]) {
    assert.deepEqual(resolveCareerTextChatModelForRequest(model, false), {
      model: GPT_61_TERRA_MODEL,
      openAIResponsesReasoningEffort: "high",
    });
    assert.equal(resolveCareerTextChatModelForRequest(model, true).model, model);
  }
});

test("continuations restore a server-saved model without inferring missing historical choices", () => {
  assert.deepEqual(readCareerSourceTextChatModel({ careerTextChatModel: GPT_61_SOL_ULTRAFAST_MODEL }), resolveCareerTextChatModel(GPT_61_SOL_ULTRAFAST_MODEL));
  assert.deepEqual(readCareerSourceTextChatModel({ careerTextChatModel: GPT_61_SOL_MODEL }), resolveCareerTextChatModel(GPT_61_SOL_MODEL));
  assert.deepEqual(readCareerSourceTextChatModel({ careerTextChatModel: CLAUDE_HAIKU_MODEL }), { model: CLAUDE_HAIKU_MODEL });
  assert.equal(readCareerSourceTextChatModel({}), undefined);
  assert.equal(readCareerSourceTextChatModel({ careerTextChatModel: "unsupported" }), undefined);
});

test("separate effort selections survive saved turns and become canonical provider requests", async () => {
  const { OPENAI_CHAT_PRESETS } = await import("@/lib/llm/modelConfig");
  const { buildOpenAIResponsesRequest } = await import("@/lib/llm/responsesChatAdapter");
  for (const preset of OPENAI_CHAT_PRESETS) {
    assert.equal(isCareerTextChatModelId(preset.id), true);
    const selected = resolveCareerTextChatModelForRequest(preset.id, true);
    const restored = readCareerSourceTextChatModel({ careerTextChatModel: selected.model });
    assert.deepEqual(restored, selected);
    assert.equal(restored?.openAIResponsesReasoningEffort, preset.effort);
    const request = buildOpenAIResponsesRequest({ model: selected.model,
      reasoningEffort: selected.openAIResponsesReasoningEffort!, requestBody: { messages: [{ role: "user", content: "Hello" }] } });
    assert.equal(request.model, preset.tierModel === GPT_61_SOL_ULTRAFAST_MODEL ? GPT_61_SOL_MODEL : preset.tierModel);
    assert.equal(request.reasoning.effort, preset.effort);
    assert.equal(resolveCareerTextChatModelForRequest(preset.id, false).model, DEFAULT_CAREER_TEXT_CHAT_MODEL);
  }
});
