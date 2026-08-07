import { createChatCompletionWithFallback } from "@/lib/llm/llm";
import { GPT_56_LUNA_MODEL } from "@/lib/llm/modelConfig";
import { createLlmDebugCall, type LlmDebugCall } from "@/lib/llm/debugUsage";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";

export type SlackReplyRoutingDecision = "respond" | "ignore" | "uncertain";

export type SlackReplyRoutingMessage = {
  content: string;
  role: "assistant" | "user";
  slackUserId?: string | null;
};

const MAX_ROUTING_MESSAGES = 10;
const MAX_MESSAGE_CHARACTERS = 360;

const ROUTER_SYSTEM_PROMPT = `Decide whether Harper should reply to the latest message in a shared Slack thread.
respond: it asks Harper for information or action, answers Harper, or clearly continues with Harper.
ignore: it is human-to-human discussion, a simple acknowledgement, or needs no Harper reply.
uncertain: the intended recipient is unclear.
Return exactly one lowercase word: respond, ignore, or uncertain.`;

function compact(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
  if (
    decision === "respond" ||
    decision === "ignore" ||
    decision === "uncertain"
  ) {
    return decision;
  }
  return "uncertain";
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
  if (!input) return "uncertain";

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
    return "uncertain";
  }
}
