import type { CareerMessage } from "@/components/career/types";

function isSupplementaryMessage(message: CareerMessage) {
  return Boolean(message.simulationSession || message.simulationAction ||
    message.simulation || message.applicationStartOffer);
}

// Choice clicks send their exact value as a normal, persisted user message.
// Derive the UI from that reply so reloads and failed-send removal agree.
export function choiceRepliesByMessageId(messages: readonly CareerMessage[]) {
  const replies = new Map<string, string>();
  let candidate: CareerMessage | undefined;
  for (const message of messages) {
    if (message.role === "user") {
      if (candidate?.content.includes("[[CAREER_CHOICE_BUTTONS]]")) {
        replies.set(String(candidate.id), message.content.trim());
      }
      candidate = undefined;
    } else if (!isSupplementaryMessage(message)) {
      candidate = message.role === "assistant" ? message : undefined;
    }
  }
  return replies;
}

// Simulation state/card messages can follow the answer without replacing its choices.
export function latestChoiceMessageIndex(messages: readonly CareerMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "user") return -1;
    if (isSupplementaryMessage(message)) continue;
    return message.role === "assistant" ? index : -1;
  }
  return -1;
}
