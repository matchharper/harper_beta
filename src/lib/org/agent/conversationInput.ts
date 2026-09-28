export type OrgAgentConversationInput = {
  id: number;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  speaker: string;
  references: string;
  /** Actual persisted tool calls, never inferred from message text. Availability only. */
  toolNames?: string[];
  source: "company" | "harper" | "candidate_contact";
  complete: boolean;
};

export function conversationCompatibilityText(messages: OrgAgentConversationInput[]) {
  return messages.map((m) => [
    `message_id=${m.id} created_at=${m.createdAt ?? "unknown"} role=${m.role} speaker=${JSON.stringify(m.speaker)} source=${m.source} complete=${m.complete}`,
    m.references,
    m.content,
  ].filter(Boolean).join("\n")).join("\n\n");
}
