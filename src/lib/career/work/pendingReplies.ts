import type { WorkScope } from "./store";

/** Legacy inline replies have no delegated-work row. Expose their user source,
 * never their saved provider transcript or executor dependencies. */
export async function listPendingReplies(scope: WorkScope, callerReplyId?: string) {
  const { data, error } = await (scope.admin.from as any)("talent_agent_runtime")
    .select("state").eq("user_id", scope.userId).eq("conversation_id", scope.conversationId).maybeSingle();
  if (error) throw error;
  const state = data?.state ?? {};
  return Object.entries(state.checkpoints ?? {}).flatMap(([replyId, raw]) => {
    const checkpoint = raw as any;
    if (replyId === callerReplyId || replyId.startsWith("invocation:") || state.completedReplyIds?.[replyId] !== undefined) return [];
    return [{ replyId, checkpointId: String(checkpoint.checkpointId), sourceMessageId: checkpoint.continuation?.sourceMessageId ?? null }];
  });
}

export function formatPendingReply(reply: { replyId: string; checkpointId: string; sourceMessageId: number | null }) {
  return `Pending conversation request ${reply.replyId}; checkpoint ${reply.checkpointId}; user message ${reply.sourceMessageId ?? "unavailable"}. manage_work cancel accepts this reply_id and checkpoint_id.`;
}
