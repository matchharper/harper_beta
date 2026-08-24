export const CHAT_COMPOSER_PICKER_PAGE_SIZE = 20;

export type ChatComposerTriggerSearch = {
  query: string;
  start: number;
  trigger: string;
};

export function applyChatComposerPickerSelection(args: {
  cursor: number;
  search: Pick<ChatComposerTriggerSearch, "start">;
  selectedText: string;
  value: string;
}) {
  const before = args.value.slice(0, args.search.start);
  const after = args.value.slice(Math.max(0, args.cursor));
  const insertion = `${args.selectedText}${after.startsWith(" ") ? "" : " "}`;

  return {
    cursor: before.length + insertion.length,
    selectedEnd: before.length + args.selectedText.length,
    selectedStart: before.length,
    value: `${before}${insertion}${after}`,
  };
}

export function getChatComposerTriggerSearch(args: {
  cursor: number;
  triggers: readonly string[];
  value: string;
}): ChatComposerTriggerSearch | null {
  const prefix = args.value.slice(0, Math.max(0, args.cursor));
  let activeTrigger = "";
  let triggerIndex = -1;

  for (const trigger of args.triggers) {
    if (!trigger) continue;
    const index = prefix.lastIndexOf(trigger);
    if (index > triggerIndex) {
      activeTrigger = trigger;
      triggerIndex = index;
    }
  }

  if (triggerIndex < 0 || !activeTrigger) return null;
  const queryText = prefix.slice(triggerIndex + activeTrigger.length);
  if (queryText.includes("\n") || queryText.includes("  ")) return null;

  return {
    query: queryText.trim(),
    start: triggerIndex,
    trigger: activeTrigger,
  };
}
