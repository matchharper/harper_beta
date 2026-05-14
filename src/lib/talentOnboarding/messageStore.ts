import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
} from "@/lib/talentOnboarding/onboarding";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";

const HIDDEN_MESSAGE_TYPES = new Set([
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
  TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
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
      "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
    )
    .eq("conversation_id", conversationId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_messages");
  }

  return removeHiddenMessages((data ?? []) as TalentMessageRow[]);
}

export async function fetchOnboardingCompletionWrapupMessage(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data: existing, error: existingError } = await args.admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
    )
    .eq("conversation_id", args.conversationId)
    .eq("user_id", args.userId)
    .eq("message_type", TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.message ?? "Failed to read onboarding completion wrap-up"
    );
  }

  return existing ? (existing as TalentMessageRow) : null;
}

export async function insertOnboardingCompletionWrapupMessage(args: {
  admin: TalentAdminClient;
  content: string;
  conversationId: string;
  thinkingLogs?: string[];
  userId: string;
}) {
  const content = args.content.trim();
  if (!content) {
    throw new Error("Onboarding completion wrap-up content is required");
  }

  const existing = await fetchOnboardingCompletionWrapupMessage(args);
  if (existing) return existing;

  const { data, error } = await args.admin
    .from("talent_messages")
    .insert({
      conversation_id: args.conversationId,
      content,
      message_type: TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
      role: "assistant",
      thinking_logs: args.thinkingLogs ?? null,
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to insert onboarding completion wrap-up"
    );
  }

  return data as TalentMessageRow;
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
      "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
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
  const visibleRows: TalentMessageRow[] = [];
  const batchSize = Math.min(Math.max(pageSize + 1, 40), 100);
  let cursor = beforeMessageId ?? null;

  while (visibleRows.length <= pageSize) {
    let query = admin
      .from("talent_messages")
      .select(
        "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
      )
      .eq("conversation_id", conversationId)
      .not("content", "like", `${TALENT_PENDING_QUESTION_PREFIX}%`)
      .order("id", { ascending: false })
      .limit(batchSize);

    if (cursor) {
      query = query.lt("id", cursor);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(
        error.message ?? "Failed to load visible talent_messages"
      );
    }

    const rawRows = (data ?? []) as TalentMessageRow[];
    if (rawRows.length === 0) break;

    visibleRows.push(...removeHiddenMessages(rawRows));
    cursor = rawRows[rawRows.length - 1]?.id ?? null;

    if (rawRows.length < batchSize || !cursor) break;
  }

  const hasMore = visibleRows.length > pageSize;
  const pageRows = hasMore ? visibleRows.slice(0, pageSize) : visibleRows;
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
