import { stripSlackSentUsingAttribution } from "@/lib/org/slackMessageText";

export type OrgAgentConversationHistoryType = "all" | "thread";

export type OrgAgentConversationHistoryMessage = {
  content: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  role: "assistant" | "system" | "user";
  slackUserId: string | null;
};

export type OrgAgentConversationThreadPreview = {
  channelName: string | null;
  currentThread: boolean;
  firstMessages: OrgAgentConversationHistoryMessage[];
  lastMessageAt: string;
  messageCount: number;
  threadId: string;
  threadStartedAt: string;
};

export type OrgAgentConversationThreadDetail = {
  channelName: string | null;
  currentThread: boolean;
  hasMoreMessages: boolean;
  lastMessageAt: string | null;
  messageCount: number;
  messages: OrgAgentConversationHistoryMessage[];
  messagesAfterSummary: boolean;
  nextCursor: string | null;
  rollingSummary: string | null;
  summarizedMessageCount: number;
  summarizedThroughAt: string | null;
  threadId: string;
  threadStartedAt: string | null;
};

export type OrgAgentConversationHistoryResult =
  | {
      hasMore: boolean;
      limit: number;
      nextCursor: string | null;
      threads: OrgAgentConversationThreadPreview[];
      type: "all";
    }
  | {
      missingThreadIds: string[];
      threads: OrgAgentConversationThreadDetail[];
      type: "thread";
    };

export class OrgAgentConversationHistoryCursorError extends Error {}

type OrgAgentThreadListCursor = {
  beforeLastMessageId: number;
  kind: "thread_list";
  version: 2;
};

type OrgAgentThreadMessageCursor = {
  beforeMessageId: number;
  kind: "thread_messages";
  summaryEndMessageId: number | null;
  threadId: string;
  version: 2;
};

type OrgAgentConversationHistoryAdminClient = {
  from: (table: string) => any;
  rpc: any;
};

type StoredMessageRow = {
  content: string;
  created_at: string;
  id: number;
  metadata: unknown;
  role: "assistant" | "system" | "user";
  slack_user_id: string | null;
};

type ThreadIndexRow = {
  channel_name: string | null;
  first_messages: unknown;
  last_message_at: string;
  last_message_id: number;
  message_count: number;
  slack_thread_id: string;
  thread_started_at: string;
};

const MAX_SELECTED_THREADS = 3;
const THREAD_DETAIL_MESSAGE_LIMIT = 40;
const MIN_THREAD_DETAIL_MESSAGE_LIMIT = 12;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function slackThreadDate(value: unknown) {
  const seconds = Number(text(value));
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1_000).toISOString()
    : null;
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toHistoryMessage(
  value: unknown
): OrgAgentConversationHistoryMessage | null {
  const row = metadataRecord(value);
  const role =
    row.role === "assistant" || row.role === "system" || row.role === "user"
      ? row.role
      : null;
  const createdAt = text(row.createdAt ?? row.created_at);
  if (!role || !createdAt) return null;
  return {
    content: stripSlackSentUsingAttribution(row.content),
    createdAt,
    metadata: metadataRecord(row.metadata),
    role,
    slackUserId: text(row.slackUserId ?? row.slack_user_id) || null,
  };
}

export function createOrgAgentThreadListCursor(beforeLastMessageId: number) {
  const cursor: OrgAgentThreadListCursor = {
    beforeLastMessageId,
    kind: "thread_list",
    version: 2,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeThreadListCursor(value: string): OrgAgentThreadListCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<OrgAgentThreadListCursor>;
    if (
      parsed.version !== 2 ||
      parsed.kind !== "thread_list" ||
      !Number.isSafeInteger(parsed.beforeLastMessageId) ||
      Number(parsed.beforeLastMessageId) <= 0
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as OrgAgentThreadListCursor;
  } catch {
    throw new OrgAgentConversationHistoryCursorError(
      "Invalid Slack thread-list cursor"
    );
  }
}

function createOrgAgentThreadMessageCursor(args: {
  beforeMessageId: number;
  summaryEndMessageId: number | null;
  threadId: string;
}) {
  const cursor: OrgAgentThreadMessageCursor = {
    ...args,
    kind: "thread_messages",
    version: 2,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeThreadMessageCursor(value: string): OrgAgentThreadMessageCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<OrgAgentThreadMessageCursor>;
    if (
      parsed.version !== 2 ||
      parsed.kind !== "thread_messages" ||
      !text(parsed.threadId) ||
      !Number.isSafeInteger(parsed.beforeMessageId) ||
      Number(parsed.beforeMessageId) <= 0 ||
      (parsed.summaryEndMessageId !== null &&
        (!Number.isSafeInteger(parsed.summaryEndMessageId) ||
          Number(parsed.summaryEndMessageId) <= 0))
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as OrgAgentThreadMessageCursor;
  } catch {
    throw new OrgAgentConversationHistoryCursorError(
      "Invalid Slack thread-message cursor"
    );
  }
}

async function fetchThreadList(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  conversationId: string;
  currentSlackThreadId: string | null;
  currentUserMessageId: number;
  cursor?: string | null;
  limit: number;
}): Promise<OrgAgentConversationHistoryResult> {
  const cursor = args.cursor ? decodeThreadListCursor(args.cursor) : null;
  const limit = boundedInteger(args.limit, 5, 1, 10);
  const { data, error } = await args.admin.rpc(
    "list_company_agent_slack_threads_v1",
    {
      p_before_last_message_id: cursor?.beforeLastMessageId ?? null,
      p_conversation_id: args.conversationId,
      p_limit: limit + 1,
      p_max_message_id: args.currentUserMessageId,
    }
  );
  if (error) throw error;
  const rows = (data ?? []) as ThreadIndexRow[];
  const selected = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const oldest = selected.at(-1);
  return {
    hasMore,
    limit,
    nextCursor:
      hasMore && oldest
        ? createOrgAgentThreadListCursor(Number(oldest.last_message_id))
        : null,
    threads: selected.flatMap((row) => {
      const threadId = text(row.slack_thread_id);
      const threadStartedAt = text(row.thread_started_at);
      const lastMessageAt = text(row.last_message_at);
      if (!threadId || !threadStartedAt || !lastMessageAt) return [];
      return [
        {
          channelName: text(row.channel_name) || null,
          currentThread: threadId === args.currentSlackThreadId,
          firstMessages: parseJsonArray(row.first_messages).flatMap(
            (message) => {
              const parsed = toHistoryMessage(message);
              return parsed ? [parsed] : [];
            }
          ),
          lastMessageAt,
          messageCount: Math.max(0, Number(row.message_count) || 0),
          threadId,
          threadStartedAt,
        },
      ];
    }),
    type: "all",
  };
}

async function fetchThreadMetadata(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  threadIds: string[];
}) {
  const { data, error } = await args.admin
    .from("company_slack_threads")
    .select(
      "id, slack_thread_ts, channel:company_slack_channels(slack_channel_name)"
    )
    .in("id", args.threadIds);
  if (error) throw error;
  return new Map(
    (
      (data ?? []) as Array<{
        channel:
          | Array<{ slack_channel_name: string | null }>
          | { slack_channel_name: string | null }
          | null;
        id: string;
        slack_thread_ts: string | null;
      }>
    ).map((row) => {
      const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel;
      return [
        text(row.id),
        {
          channelName: text(channel?.slack_channel_name) || null,
          threadStartedAt: slackThreadDate(row.slack_thread_ts),
        },
      ] as const;
    })
  );
}

async function fetchOneThreadDetail(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  conversationId: string;
  currentSlackThreadId: string | null;
  currentUserMessageId: number;
  cursor: OrgAgentThreadMessageCursor | null;
  metadata: {
    channelName: string | null;
    threadStartedAt: string | null;
  };
  messageLimit: number;
  threadId: string;
  workspaceId: string;
}): Promise<OrgAgentConversationThreadDetail | null> {
  const baseMessageQuery = (
    columns: string,
    options?: { count?: "exact"; head?: boolean }
  ) =>
    args.admin
      .from("company_messages")
      .select(columns, options)
      .eq("company_workspace_id", args.workspaceId)
      .eq("conversation_id", args.conversationId)
      .eq("message_type", "slack")
      .eq("slack_thread_id", args.threadId)
      .lte("id", args.currentUserMessageId);

  const [summaryResult, latestMessageResult] = await Promise.all([
    args.admin
      .from("company_conversation_summaries")
      .select("id, content, message_count, metadata, source_end_message_id")
      .eq("conversation_id", args.conversationId)
      .eq("slack_thread_id", args.threadId)
      .lte("source_end_message_id", args.currentUserMessageId)
      .order("source_end_message_id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    baseMessageQuery("id, created_at", { count: "exact" })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (summaryResult.error) throw summaryResult.error;
  if (latestMessageResult.error) throw latestMessageResult.error;
  const totalMessageCount = Number(latestMessageResult.count ?? 0);
  if (totalMessageCount <= 0) return null;

  const summary = summaryResult.data
    ? (summaryResult.data as {
        content: string;
        message_count: number;
        metadata: unknown;
        source_end_message_id: number;
      })
    : null;
  let messageQuery = baseMessageQuery(
    "id, role, content, created_at, metadata, slack_user_id"
  ).order("id", { ascending: false });
  if (summary) {
    messageQuery = messageQuery.gt("id", summary.source_end_message_id);
  }
  if (args.cursor) {
    messageQuery = messageQuery.lt("id", args.cursor.beforeMessageId);
  }
  const { data: messageData, error: messageError } = await messageQuery.limit(
    args.messageLimit + 1
  );
  if (messageError) throw messageError;
  const rows = (messageData ?? []) as StoredMessageRow[];
  const hasMoreMessages = rows.length > args.messageLimit;
  const selectedRows = rows.slice(0, args.messageLimit);
  const messages = selectedRows.reverse().flatMap((row) => {
    const parsed = toHistoryMessage(row);
    return parsed ? [parsed] : [];
  });
  const summaryMetadata = metadataRecord(summary?.metadata);
  return {
    channelName: args.metadata.channelName,
    currentThread: args.threadId === args.currentSlackThreadId,
    hasMoreMessages,
    lastMessageAt: text(latestMessageResult.data?.created_at) || null,
    messageCount: totalMessageCount,
    messages,
    messagesAfterSummary: Boolean(summary),
    nextCursor:
      hasMoreMessages && selectedRows.at(-1)
        ? createOrgAgentThreadMessageCursor({
            beforeMessageId: selectedRows.at(-1)!.id,
            summaryEndMessageId: summary?.source_end_message_id ?? null,
            threadId: args.threadId,
          })
        : null,
    rollingSummary: summary ? text(summary.content) || null : null,
    summarizedMessageCount: Math.max(0, Number(summary?.message_count) || 0),
    summarizedThroughAt: text(summaryMetadata.sourceEndAt) || null,
    threadId: args.threadId,
    threadStartedAt: args.metadata.threadStartedAt,
  };
}

async function fetchSelectedThreads(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  conversationId: string;
  currentSlackThreadId: string | null;
  currentUserMessageId: number;
  cursor?: string | null;
  threadIds: string[];
  workspaceId: string;
}): Promise<OrgAgentConversationHistoryResult> {
  const threadIds = Array.from(
    new Set(args.threadIds.map(text).filter(Boolean))
  ).slice(0, MAX_SELECTED_THREADS);
  if (threadIds.length === 0) {
    throw new OrgAgentConversationHistoryCursorError(
      "threadIds must contain at least one Slack thread ID"
    );
  }
  const cursor = args.cursor ? decodeThreadMessageCursor(args.cursor) : null;
  if (cursor && (threadIds.length !== 1 || cursor.threadId !== threadIds[0])) {
    throw new OrgAgentConversationHistoryCursorError(
      "Thread-message cursor does not match the selected thread"
    );
  }
  const metadata = await fetchThreadMetadata({
    admin: args.admin,
    threadIds,
  });
  const messageLimit = Math.max(
    MIN_THREAD_DETAIL_MESSAGE_LIMIT,
    Math.floor(THREAD_DETAIL_MESSAGE_LIMIT / threadIds.length)
  );
  const details = await Promise.all(
    threadIds.map(async (threadId) => {
      const threadMetadata = metadata.get(threadId);
      if (!threadMetadata) return null;
      return fetchOneThreadDetail({
        ...args,
        cursor,
        messageLimit,
        metadata: threadMetadata,
        threadId,
      });
    })
  );
  const threads = details.filter(
    (detail): detail is OrgAgentConversationThreadDetail => Boolean(detail)
  );
  const found = new Set(threads.map((thread) => thread.threadId));
  return {
    missingThreadIds: threadIds.filter((threadId) => !found.has(threadId)),
    threads,
    type: "thread",
  };
}

/** Reads only Slack messages already persisted for this Harper conversation. */
export async function fetchOrgAgentConversationHistory(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  conversationId: string;
  currentSlackThreadId: string | null;
  currentUserMessageId: number;
  cursor?: string | null;
  limit?: number;
  threadIds?: string[];
  type: OrgAgentConversationHistoryType;
  workspaceId: string;
}): Promise<OrgAgentConversationHistoryResult> {
  if (args.type === "all") {
    return fetchThreadList({
      ...args,
      limit: args.limit ?? 5,
    });
  }
  if (args.type === "thread") {
    return fetchSelectedThreads({
      ...args,
      threadIds: args.threadIds ?? [],
    });
  }
  throw new OrgAgentConversationHistoryCursorError(
    "type must be all or thread"
  );
}
