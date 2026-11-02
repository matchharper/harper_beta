import type { CareerMessage } from "@/components/career/types";

type MessageNode = { message: CareerMessage; next: MessageNode | null };
type MergedMessage = {
  persisted: CareerMessage;
  local: CareerMessage;
  result: CareerMessage;
};

/** Merge immutable history and local messages, preserving local insertion order. */
export function createCareerMessageMerger() {
  // Keep only the current source pair for each overlapping message.
  let previous = new Map<string, MergedMessage>();
  return (
    persistedMessages: CareerMessage[],
    localMessages: CareerMessage[],
  ) => {
    if (localMessages.length === 0) {
      previous.clear();
      return persistedMessages;
    }

    const byId = new Map<string, MessageNode>();
    const byRequestId = new Map<string, MessageNode>();
    let head: MessageNode | null = null;
    let tail: MessageNode | null = null;
    for (const message of persistedMessages) {
      const node: MessageNode = { message, next: null };
      if (tail) tail.next = node;
      else head = node;
      tail = node;
      byId.set(String(message.id), node);
      if (message.role === "user" && message.clientRequestId) byRequestId.set(message.clientRequestId, node);
    }

    let cursor = tail;
    const current = new Map<string, MergedMessage>();
    for (const local of localMessages) {
      const id = String(local.id);
      const existing = byId.get(id) ?? (local.role === "user" && local.clientRequestId ? byRequestId.get(local.clientRequestId) : undefined);
      if (existing) {
        const persisted = existing.message;
        // A history refresh may contain only an application reference. Preserve
        // the local streamed card until a newer hydrated result arrives.
        const newerSimulation =
          local.simulation &&
          (!persisted.simulation ||
            Date.parse(local.simulation.updatedAt) >
              Date.parse(persisted.simulation.updatedAt));
        if (
          newerSimulation ||
          local.typing ||
          (local.thinkingLogs?.length ?? 0) > 0
        ) {
          const cached = previous.get(id);
          const entry =
            cached?.persisted === persisted && cached.local === local
              ? cached
              : { persisted, local, result: { ...persisted, ...local } };
          existing.message = entry.result;
          current.set(id, entry);
        }
        cursor = existing;
      } else {
        const node: MessageNode = {
          message: local,
          next: cursor?.next ?? null,
        };
        if (cursor) cursor.next = node;
        else head = node;
        byId.set(id, node);
        cursor = node;
      }
    }

    const messages: CareerMessage[] = [];
    for (let node = head; node; node = node.next) messages.push(node.message);
    previous = current;
    return messages;
  };
}
