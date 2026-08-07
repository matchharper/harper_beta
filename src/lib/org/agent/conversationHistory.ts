export type OrgAgentConversationHistoryScope =
  | "current_thread"
  | "workspace";

export type OrgAgentConversationHistoryResult = {
  hasMore: boolean;
  limit: number;
  messages: Array<{
    channelName: string | null;
    content: string;
    createdAt: string;
    currentThread: boolean;
    metadata: Record<string, unknown>;
    role: "assistant" | "system" | "user";
    slackThreadId: string | null;
    slackUserId: string | null;
    threadStartedAt: string | null;
  }>;
  nextCursor: string | null;
  scope: OrgAgentConversationHistoryScope;
};

export class OrgAgentConversationHistoryCursorError extends Error {}

type OrgAgentConversationHistoryCursor = {
  beforeId: number;
  scope: OrgAgentConversationHistoryScope;
  slackThreadId: string | null;
  version: 1;
};

type OrgAgentConversationHistoryAdminClient = {
  from: (table: string) => any;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function createOrgAgentConversationHistoryCursor(
  cursor: Omit<OrgAgentConversationHistoryCursor, "version">
) {
  return Buffer.from(
    JSON.stringify({ ...cursor, version: 1 }),
    "utf8"
  ).toString("base64url");
}

function decodeConversationHistoryCursor(
  value: string
): OrgAgentConversationHistoryCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Partial<OrgAgentConversationHistoryCursor>;
    if (
      parsed.version !== 1 ||
      (parsed.scope !== "current_thread" && parsed.scope !== "workspace") ||
      !Number.isSafeInteger(parsed.beforeId) ||
      Number(parsed.beforeId) <= 0 ||
      (parsed.slackThreadId !== null &&
        typeof parsed.slackThreadId !== "string")
    ) {
      throw new Error("invalid cursor payload");
    }
    return parsed as OrgAgentConversationHistoryCursor;
  } catch {
    throw new OrgAgentConversationHistoryCursorError(
      "Invalid conversation history cursor"
    );
  }
}

function slackThreadDate(value: unknown) {
  const seconds = Number(text(value).split(".")[0]);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1_000).toISOString()
    : null;
}

/** Reads only Slack messages already persisted for this Harper workspace. */
export async function fetchOrgAgentConversationHistory(args: {
  admin: OrgAgentConversationHistoryAdminClient;
  conversationId: string;
  currentSlackThreadId: string | null;
  currentUserMessageId: number;
  cursor?: string | null;
  limit: number;
  scope: OrgAgentConversationHistoryScope;
  workspaceId: string;
}): Promise<OrgAgentConversationHistoryResult> {
  const cursor = args.cursor
    ? decodeConversationHistoryCursor(args.cursor)
    : null;
  if (
    cursor &&
    (cursor.scope !== args.scope ||
      (args.scope === "current_thread" &&
        cursor.slackThreadId !== args.currentSlackThreadId))
  ) {
    throw new OrgAgentConversationHistoryCursorError(
      "Conversation history cursor does not match the requested scope"
    );
  }

  const beforeId = cursor?.beforeId ?? args.currentUserMessageId;
  let query = args.admin
    .from("company_messages")
    .select(
      "id, role, content, created_at, metadata, slack_thread_id, slack_user_id"
    )
    .eq("company_workspace_id", args.workspaceId)
    .eq("conversation_id", args.conversationId)
    .eq("message_type", "slack")
    .not("slack_thread_id", "is", null)
    .lt("id", Math.min(beforeId, args.currentUserMessageId))
    .order("id", { ascending: false });
  if (args.scope === "current_thread") {
    if (!args.currentSlackThreadId) {
      throw new OrgAgentConversationHistoryCursorError(
        "Current Slack thread is unavailable"
      );
    }
    query = query.eq("slack_thread_id", args.currentSlackThreadId);
  }

  const { data, error } = await query.limit(args.limit + 1);
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    content: string;
    created_at: string;
    id: number;
    metadata: unknown;
    role: "assistant" | "system" | "user";
    slack_thread_id: string | null;
    slack_user_id: string | null;
  }>;
  const selected = rows.slice(0, args.limit);
  const hasMore = rows.length > args.limit;
  const oldest = selected.at(-1);
  const threadIds = Array.from(
    new Set(
      selected.map((row) => text(row.slack_thread_id)).filter(Boolean)
    )
  );
  const threadMetadata = new Map<
    string,
    { channelName: string | null; threadStartedAt: string | null }
  >();
  if (threadIds.length > 0) {
    const { data: threadData, error: threadError } = await args.admin
      .from("company_slack_threads")
      .select(
        "id, slack_thread_ts, channel:company_slack_channels(slack_channel_name)"
      )
      .in("id", threadIds);
    if (threadError) throw threadError;
    for (const row of (threadData ?? []) as Array<{
      channel:
        | Array<{ slack_channel_name: string | null }>
        | { slack_channel_name: string | null }
        | null;
      id: string;
      slack_thread_ts: string | null;
    }>) {
      const channel = Array.isArray(row.channel) ? row.channel[0] : row.channel;
      threadMetadata.set(text(row.id), {
        channelName: text(channel?.slack_channel_name) || null,
        threadStartedAt: slackThreadDate(row.slack_thread_ts),
      });
    }
  }

  return {
    hasMore,
    limit: args.limit,
    messages: selected.reverse().map((row) => {
      const slackThreadId = text(row.slack_thread_id) || null;
      const metadata = threadMetadata.get(slackThreadId ?? "");
      return {
        channelName: metadata?.channelName ?? null,
        content: row.content ?? "",
        createdAt: row.created_at,
        currentThread: slackThreadId === args.currentSlackThreadId,
        metadata: metadataRecord(row.metadata),
        role: row.role,
        slackThreadId,
        slackUserId: text(row.slack_user_id) || null,
        threadStartedAt: metadata?.threadStartedAt ?? null,
      };
    }),
    nextCursor:
      hasMore && oldest
        ? createOrgAgentConversationHistoryCursor({
            beforeId: Number(oldest.id),
            scope: args.scope,
            slackThreadId:
              args.scope === "current_thread"
                ? args.currentSlackThreadId
                : null,
          })
        : null,
    scope: args.scope,
  };
}
