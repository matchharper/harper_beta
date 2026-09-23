import { getEncoding } from "js-tiktoken";

export const CONVERSATION_SUMMARY_MESSAGE_TRIGGER = 24;
export const CONVERSATION_SUMMARY_SOURCE_TOKEN_TRIGGER = 4_500;

let tokenizer: ReturnType<typeof getEncoding> | null = null;

function getConversationSummaryTokenizer() {
  tokenizer ??= getEncoding("o200k_base");
  return tokenizer;
}

export function countConversationSummaryTokens(text: string) {
  const normalized = text.trim();
  if (!normalized) return 0;
  return getConversationSummaryTokenizer().encode(normalized).length;
}

export function buildConversationSummaryBatch<T>(args: {
  items: readonly T[];
  messageTrigger?: number;
  renderItem: (item: T) => string;
  tokenTrigger?: number;
}) {
  const messageTrigger = Math.max(
    1,
    args.messageTrigger ?? CONVERSATION_SUMMARY_MESSAGE_TRIGGER
  );
  const tokenTrigger = Math.max(
    1,
    args.tokenTrigger ?? CONVERSATION_SUMMARY_SOURCE_TOKEN_TRIGGER
  );
  const items: T[] = [];
  const renderedItems: string[] = [];
  let sourceTokenCount = 0;

  for (const item of args.items) {
    items.push(item);
    renderedItems.push(args.renderItem(item));
    sourceTokenCount = countConversationSummaryTokens(renderedItems.join("\n"));

    if (items.length >= messageTrigger || sourceTokenCount >= tokenTrigger) {
      return {
        items,
        sourceTokenCount,
        triggered: true as const,
        triggerReason:
          items.length >= messageTrigger && sourceTokenCount >= tokenTrigger
            ? ("messages_and_tokens" as const)
            : items.length >= messageTrigger
              ? ("messages" as const)
              : ("tokens" as const),
      };
    }
  }

  return {
    items,
    sourceTokenCount,
    triggered: false as const,
    triggerReason: null,
  };
}
