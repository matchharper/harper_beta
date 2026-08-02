import type { CallTranscriptEntry } from "./types";

export function finalizeAssistantTranscriptEntries(args: {
  alreadyRendered?: boolean;
  entries: CallTranscriptEntry[];
  text: string;
  timestamp: string;
  wasStreaming: boolean;
}) {
  const {
    alreadyRendered = false,
    entries,
    text,
    timestamp,
    wasStreaming,
  } = args;

  const renderedAssistantIndex =
    wasStreaming || alreadyRendered
      ? entries.findLastIndex(
          (entry) =>
            entry.role === "assistant" &&
            (!alreadyRendered || entry.text === text)
        )
      : -1;

  if (renderedAssistantIndex >= 0) {
    const renderedAssistant = entries[renderedAssistantIndex];
    const entriesWithoutRenderedAssistant = entries.filter(
      (_, index) => index !== renderedAssistantIndex
    );

    // A final user transcript can arrive after assistant output has already
    // started. The DB save path writes that turn as user -> assistant, so move
    // the rendered assistant to the end of the turn instead of preserving the
    // provider event arrival order.
    return [
      ...entriesWithoutRenderedAssistant,
      {
        ...renderedAssistant,
        text,
        timestamp,
      },
    ];
  }

  return [...entries, { role: "assistant" as const, text, timestamp }];
}
