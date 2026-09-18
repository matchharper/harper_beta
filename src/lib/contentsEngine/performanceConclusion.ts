import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { OPENROUTER_GLM_53_FLASH_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  buildContentPerformanceConclusionMessages,
  normalizeContentPerformanceConclusion,
  type ContentPerformanceConclusion,
  type ContentPerformanceConclusionInput,
} from "@/lib/contentsEngine/performanceConclusionContract";

export type {
  ContentPerformanceConclusion,
  ContentPerformanceConclusionInput,
  ContentPerformanceRating,
} from "@/lib/contentsEngine/performanceConclusionContract";

function assistantText(response: any) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => String(item?.text ?? item?.content ?? ""))
    .join("")
    .trim();
}

function parseJsonObject(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Content performance conclusion must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function concludeContentPerformance(
  input: ContentPerformanceConclusionInput,
  options: { logUsage?: boolean } = {}
): Promise<ContentPerformanceConclusion> {
  const label = "contents-engine/content-performance-conclusion:review";
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: null,
    buildRequest: () => ({
      max_tokens: 220,
      messages: buildContentPerformanceConclusionMessages(input),
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    chatCompletionReasoning: { reasoningEffort: "low" },
    debugLabel: label,
    fallbackModel: null,
    model: OPENROUTER_GLM_53_FLASH_MODEL,
    validateResponse: (candidate) => {
      normalizeContentPerformanceConclusion(
        parseJsonObject(assistantText(candidate))
      );
    },
  });
  if (options.logUsage !== false) {
    logLlmTokenUsage({
      label,
      meta: { task: "creator_content_performance_conclusion" },
      model,
      response,
    });
  }
  return {
    ...normalizeContentPerformanceConclusion(
      parseJsonObject(assistantText(response))
    ),
    model,
  };
}

export function insufficientContentPerformanceConclusion(
  error: unknown
): ContentPerformanceConclusion {
  console.warn(
    "[contents-engine/content-performance-conclusion]",
    getLlmErrorMessage(error)
  );
  return {
    model: null,
    rating: "insufficient",
    reason: "판단 근거가 부족해 팀원의 확인이 필요함",
  };
}
