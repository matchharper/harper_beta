import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { createLlmDebugCall, type LlmDebugCall } from "@/lib/llm/debugUsage";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";

export type SlackReplyRoutingDecision = "respond" | "ignore";

export type SlackReplyRoutingMessage = {
  content: string;
  role: "assistant" | "user";
  slackUserId?: string | null;
};

const MAX_ROUTING_MESSAGES = 10;
const MAX_MESSAGE_CHARACTERS = 360;

const SCHEDULING_CONTEXT_PATTERN =
  /(미팅|인터뷰|일정|스케줄|가능(?:한)?\s*시간|시간대|초안|후보자가\s*선택|meeting|interview|schedule|availability)/i;
const SCHEDULING_REPLY_PATTERN =
  /(미팅|인터뷰|일정|스케줄|가능|불가능|오전|오후|평일|주말|매주|\d{1,2}\s*시|시간|분|참석자|메일|보내|저장|설정|확정|취소|변경|다시|이대로|그대로|좋아|괜찮|안\s*(?:돼|되|할)|네|넵|응|맞아|meeting|interview|schedule|availability|available|cancel|confirm)/i;

const ROUTER_SYSTEM_PROMPT = `Decide whether Harper should reply to the latest message in a shared Slack thread.

Choose respond unless the latest message is clearly part of a conversation between people that does not involve Harper.
respond: the latest message asks Harper for information or action, answers or reacts to Harper's latest message, continues a conversation Harper is part of, or could reasonably be addressed to Harper from the thread context. This includes casual follow-up messages. When the intended recipient is not clearly another person, choose respond.
ignore: only when the latest message is clearly human-to-human discussion and Harper would be interrupting, or it is a simple acknowledgement that needs no reply from anyone.

Return exactly one lowercase word: respond or ignore.`;

function compact(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldRespondToSchedulingThreadReply(
  messages: SlackReplyRoutingMessage[]
) {
  const recent = messages
    .map((message) => ({ ...message, content: compact(message.content) }))
    .filter((message) => message.content);
  const latest = recent.at(-1);
  if (!latest || latest.role !== "user") return false;

  const precedingAssistant = recent
    .slice(0, -1)
    .reverse()
    .find((message) => message.role === "assistant");
  return Boolean(
    precedingAssistant &&
    SCHEDULING_CONTEXT_PATTERN.test(precedingAssistant.content) &&
    SCHEDULING_REPLY_PATTERN.test(latest.content)
  );
}

export function buildSlackReplyRoutingInput(
  messages: SlackReplyRoutingMessage[]
) {
  const recent = messages
    .map((message) => ({ ...message, content: compact(message.content) }))
    .filter((message) => message.content)
    .slice(-MAX_ROUTING_MESSAGES);
  const people = new Map<string, string>();
  let nextPersonIndex = 0;
  const speaker = (message: SlackReplyRoutingMessage) => {
    if (message.role === "assistant") return "Harper";
    const userKey = compact(message.slackUserId) || "unknown";
    const existing = people.get(userKey);
    if (existing) return existing;
    const label = `Person ${String.fromCharCode(65 + nextPersonIndex)}`;
    nextPersonIndex += 1;
    people.set(userKey, label);
    return label;
  };

  return recent
    .map((message, index) => {
      const content = message.content.slice(0, MAX_MESSAGE_CHARACTERS);
      const prefix = index === recent.length - 1 ? "Latest - " : "";
      return `${prefix}${speaker(message)}: ${content}`;
    })
    .join("\n");
}

export function parseSlackReplyRoutingDecision(
  value: unknown
): SlackReplyRoutingDecision {
  const decision = compact(value).toLowerCase();
  if (decision === "respond" || decision === "ignore") {
    return decision;
  }
  // A malformed classifier reply must not silence a plausible Harper turn.
  return "respond";
}

export async function decideHarperSlackThreadReply(
  messages: SlackReplyRoutingMessage[],
  options?: {
    logUsage?: boolean;
    onDebugCall?: (call: LlmDebugCall) => void;
    signal?: AbortSignal;
  }
): Promise<SlackReplyRoutingDecision> {
  const input = buildSlackReplyRoutingInput(messages);
  if (!input) return "respond";

  try {
    const { model, response } = await createChatCompletionWithFallback({
      anthropicOverloadFallbackModel: null,
      buildRequest: () => ({
        max_completion_tokens: 16,
        messages: [
          { role: "system", content: ROUTER_SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
      }),
      debugLabel: "org/slack-router:decision",
      fallbackModel: null,
      model: GPT_56_LUNA_MODEL,
      openAIResponses: { reasoningEffort: "none" },
      signal: options?.signal,
    });
    if (options?.logUsage !== false) {
      logLlmTokenUsage({
        label: "org/slack-router:decision",
        model,
        response,
      });
    }
    options?.onDebugCall?.(
      createLlmDebugCall({
        model,
        response,
        step: "slack_reply_routing",
      })
    );
    return parseSlackReplyRoutingDecision(
      response?.choices?.[0]?.message?.content
    );
  } catch (error) {
    options?.signal?.throwIfAborted();
    console.warn("[org/slack-router]", error);
    // Route conservatively toward replying when the lightweight classifier is
    // unavailable. The company-side LLM can still ask a clarifying question.
    return "respond";
  }
}
