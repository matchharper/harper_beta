import type { CareerMessage } from "@/components/career/types";

// Simulation state/card messages can follow the answer without replacing its choices.
export function latestChoiceMessageIndex(messages: readonly CareerMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") return -1;
    if (
      message.simulationSession ||
      message.simulationAction ||
      message.simulation ||
      message.applicationStartOffer
    )
      continue;
    return message.role === "assistant" ? index : -1;
  }
  return -1;
}
