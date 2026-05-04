import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION } from "@/lib/talentOnboarding/onboarding";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";

const HIDDEN_MESSAGE_TYPES = new Set([
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
]);

function removeHiddenMessages(messages: TalentMessageRow[]) {
  return messages.filter(
    (message) => !HIDDEN_MESSAGE_TYPES.has(message.message_type ?? "")
  );
}

export async function fetchMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_messages");
  }

  return removeHiddenMessages((data ?? []) as TalentMessageRow[]);
}

export async function fetchRecentMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit?: number;
}) {
  const { admin, conversationId, limit = 24 } = args;
  const { data, error } = await admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent talent_messages");
  }

  return removeHiddenMessages(((data ?? []) as TalentMessageRow[]).reverse());
}

export async function fetchVisibleMessagesPage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit?: number;
  beforeMessageId?: number | null;
}) {
  const { admin, conversationId, limit = 20, beforeMessageId } = args;
  const pageSize = Math.max(1, Math.min(limit, 100));

  let query = admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, created_at"
    )
    .eq("conversation_id", conversationId)
    .or("message_type.is.null,message_type.neq.call_wrapup")
    .not("content", "like", `${TALENT_PENDING_QUESTION_PREFIX}%`)
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (beforeMessageId) {
    query = query.lt("id", beforeMessageId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message ?? "Failed to load visible talent_messages");
  }

  const rows = removeHiddenMessages((data ?? []) as TalentMessageRow[]);
  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const oldestRow = pageRows[pageRows.length - 1] ?? null;

  return {
    messages: pageRows.reverse(),
    nextBeforeMessageId: hasMore && oldestRow ? oldestRow.id : null,
  };
}

export async function countUserChatTurns(args: {
  admin: TalentAdminClient;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { count, error } = await admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user")
    .in("message_type", ["chat", "call_transcript"]);

  if (error) {
    throw new Error(error.message ?? "Failed to count user chat turns");
  }

  return count ?? 0;
}

export async function countAdditionalOnboardingQuestionSelections(args: {
  admin: TalentAdminClient;
  conversationId: string;
}) {
  const { admin, conversationId } = args;
  const { count, error } = await admin
    .from("talent_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .eq(
      "message_type",
      TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION
    );

  if (error) {
    throw new Error(
      error.message ?? "Failed to count additional onboarding questions"
    );
  }

  return count ?? 0;
}
