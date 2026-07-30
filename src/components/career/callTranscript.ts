import type { CallTranscriptEntry } from "./types";

export function finalizeAssistantTranscriptEntries(args: {
  entries: CallTranscriptEntry[];
  text: string;
  timestamp: string;
  wasStreaming: boolean;
}) {
  const { entries, text, timestamp, wasStreaming } = args;

  if (wasStreaming) {
    const streamingAssistantIndex = entries.findLastIndex(
      (entry) => entry.role === "assistant"
    );
    if (streamingAssistantIndex >= 0) {
      const next = [...entries];
      next[streamingAssistantIndex] = {
        ...next[streamingAssistantIndex],
        text,
        timestamp,
      };
      return next;
    }
  }

  return [...entries, { role: "assistant" as const, text, timestamp }];
}
