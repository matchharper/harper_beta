type ConversationScope = { id: string; role_id: string | null };

/**
 * A company can ask about one Role's candidate from another Role's
 * conversation. That source conversation can host the event only when it is
 * workspace-wide or the same Role; otherwise the event stays in the Role's own
 * conversation that the caller already verified.
 */
export function chooseWebActionConversation<T extends ConversationScope>(
  roleConversation: T,
  source: ConversationScope | null,
  roleId: string | null
): T {
  if (!source) return roleConversation;
  if (source.role_id && source.role_id !== roleId) return roleConversation;
  return { ...roleConversation, id: source.id, role_id: source.role_id };
}
