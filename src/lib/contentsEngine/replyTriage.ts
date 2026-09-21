import {
  createChatCompletionWithFallback,
  getLlmErrorMessage,
} from "@/lib/llm/llm";
import { OPENROUTER_GLM_53_FLASH_MODEL } from "@/lib/llm/modelConfig";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import {
  buildOutreachReplyTriageMessages,
  normalizeOutreachReplyTriage,
  type OutreachReplyTriage,
  type OutreachReplyTriageInput,
} from "@/lib/contentsEngine/replyTriageContract";

export type {
  OutreachReplyTriage,
  OutreachReplyTriageInput,
  OutreachReplyTriageType,
  OutreachReplyType,
} from "@/lib/contentsEngine/replyTriageContract";

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
    throw new Error("Outreach reply triage must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function classifyOutreachReply(
  input: OutreachReplyTriageInput,
  options: { logUsage?: boolean } = {}
): Promise<OutreachReplyTriage> {
  const label = "contents-engine/outreach-reply-triage:classify";
  const { model, response } = await createChatCompletionWithFallback({
    anthropicOverloadFallbackModel: null,
    buildRequest: () => ({
      max_tokens: 420,
      messages: buildOutreachReplyTriageMessages(input),
      response_format: { type: "json_object" },
      temperature: 0,
    }),
    chatCompletionReasoning: { reasoningEffort: "low" },
    debugLabel: label,
    fallbackModel: null,
    model: OPENROUTER_GLM_53_FLASH_MODEL,
    validateResponse: (candidate) => {
      normalizeOutreachReplyTriage(
        parseJsonObject(assistantText(candidate)),
        input.replyBody
      );
    },
  });
  if (options.logUsage !== false) {
    logLlmTokenUsage({
      label,
      meta: { task: "creator_outreach_reply_triage" },
      model,
      response,
    });
  }
  return {
    ...normalizeOutreachReplyTriage(
      parseJsonObject(assistantText(response)),
      input.replyBody
    ),
    model,
  };
}

export function unclassifiedOutreachReplyTriage(
  error: unknown
): OutreachReplyTriage {
  console.warn(
    "[contents-engine/outreach-reply-triage]",
    getLlmErrorMessage(error)
  );
  return {
    mentionedUrls: [],
    model: null,
    summary: "자동 분류에 실패해 팀원의 원문 확인이 필요합니다.",
    type: "unclassified",
  };
}
