import { runCareerConversationSummary } from "@/lib/career/llm";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NEXT_STEPS,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
} from "@/lib/talentOnboarding/onboarding";
import {
  fetchMessages,
  fetchRecentMessages,
} from "@/lib/talentOnboarding/messageStore";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";

const SUMMARY_MESSAGE_TYPE = "conversation_summary";
const DEFAULT_MIN_MESSAGE_COUNT = 14;
const DEFAULT_MIN_SOURCE_CHARS = 5000;
const DEFAULT_RECENT_MESSAGE_LIMIT = 12;
const MIN_RECENT_RAW_MESSAGES = 6;
const MAX_SOURCE_MESSAGES = 80;
const MAX_SOURCE_CHARS = 18000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type TalentConversationSummaryRow = {
  id: string;
  talent_id: string;
  conversation_id: string;
  from_message_id: number | null;
  to_message_id: number;
  message_count: number;
  segment_summary: string;
  source_char_count: number;
  summary_text: string;
  summary_json: Record<string, unknown>;
  created_at: string;
};

type TalentConversationSummaryCursorRow = Pick<
  TalentConversationSummaryRow,
  "created_at" | "to_message_id"
>;

type TalentConversationSegmentSummaryRow = Pick<
  TalentConversationSummaryRow,
  "conversation_id" | "created_at" | "segment_summary" | "to_message_id"
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(raw));
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return asRecord(JSON.parse(match[0]));
    } catch {
      return null;
    }
  }
}

function normalizeText(value: unknown, maxLength = 8000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function normalizeStringArray(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  const normalized: string[] = [];
  for (const item of value) {
    const text = normalizeText(item, 500);
    if (!text) continue;
    normalized.push(text);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function toSummaryKstDateKey(value: string | null | undefined) {
  const timestampMs = new Date(String(value ?? "").trim()).getTime();
  if (!Number.isFinite(timestampMs)) return "";
  return new Date(timestampMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function formatSummaryDateKey(dateKey: string) {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function formatMessageDateForSummary(message: TalentMessageRow) {
  return (
    formatSummaryDateKey(toSummaryKstDateKey(message.created_at)) || "unknown"
  );
}

function formatSummaryRowDateForSummary(
  summary: TalentConversationSegmentSummaryRow
) {
  return formatSummaryDateKey(toSummaryKstDateKey(summary.created_at));
}

function formatMessageDateCoverage(messages: TalentMessageRow[]) {
  const dateLabels = Array.from(
    new Set(
      messages
        .map((message) => formatMessageDateForSummary(message))
        .filter((dateLabel) => dateLabel !== "unknown")
    )
  );
  return dateLabels.length > 0 ? dateLabels.join(", ") : "(unknown)";
}

function formatMessagesForSummary(messages: TalentMessageRow[]) {
  return messages
    .map((message) => {
      const role = message.role === "assistant" ? "Harper" : "User";
      const date = formatMessageDateForSummary(message);
      const content = formatTalentMessageContentForLlmPrompt(message)
        .replace(/\s+/g, " ")
        .trim();
      return `[${message.id} | date=${date} KST] ${role}: ${content}`;
    })
    .join("\n");
}

function selectSourceMessages(messages: TalentMessageRow[]) {
  const selected: TalentMessageRow[] = [];
  let charCount = 0;

  for (const message of messages) {
    const length = message.content.trim().length;
    if (selected.length >= MAX_SOURCE_MESSAGES) break;
    if (selected.length > 0 && charCount + length > MAX_SOURCE_CHARS) break;
    selected.push(message);
    charCount += length;
  }

  return selected;
}

function buildSummarySystemPrompt() {
  return [
    "You summarize Harper career-agent conversations for future context.",
    "Return a valid JSON object only.",
    "Write Korean unless a company, role, or product name is naturally English.",
    "Preserve durable facts: career preferences, constraints, corrections, recommendation feedback, open loops, and next actions.",
    "Also write `segment_summary` from ONLY the new messages to fold in. It should be 4-8 concise Korean sentences and must not include facts that only come from the existing rolling summary.",
    "Each new message includes a KST date. `segment_summary` must include date labels for the summarized message date(s).",
    'Format each `segment_summary` segment as `[YYYY.MM.DD] "summary"`. If a single summarized segment spans consecutive dates in the same month, use `[YYYY.MM.DD~DD] "summary"`, for example `[2026.05.24~26] "..."`. If a date range crosses months or years, use full endpoints like `[YYYY.MM.DD~YYYY.MM.DD] "summary"`.',
    'When `segment_summary` covers multiple non-consecutive date groups, write multiple labeled segments separated by spaces, for example `[2026.05.14] "..." [2026.05.24~26] "..."`. Do not put unlabeled text in `segment_summary`.',
    "Treat the existing summary as prior state to merge and rewrite, not text to append.",
    "If a fact appears in both the existing summary and new messages, mention it once.",
    "If new messages correct or supersede an older fact, keep the corrected version only.",
    "Opportunity feedback notes such as saved/dismissed roles are action logs, not full user utterances. Compact many similar feedback notes into concise preference/status changes; do not let role-save logs dominate the summary.",
    "`do_not_repeat` should contain only concrete context Harper should avoid repeating because it was already covered, rejected, or annoyed the user. Do not carry forward stale empathy/style notes unless the new messages explicitly support them.",
    "Do not invent facts. Do not include routine greetings or filler.",
  ].join("\n");
}

function buildSummaryUserPrompt(args: {
  existingSummary: TalentConversationSummaryRow | null;
  messages: TalentMessageRow[];
}) {
  return [
    args.existingSummary
      ? [
          "[Existing rolling summary]",
          args.existingSummary.summary_text,
          "",
          "[Existing structured summary]",
          JSON.stringify(args.existingSummary.summary_json ?? {}, null, 2),
        ].join("\n")
      : "[Existing rolling summary]\n(none)",
    "",
    "[New message date coverage - KST]",
    formatMessageDateCoverage(args.messages),
    "",
    "[New messages to fold in]",
    formatMessagesForSummary(args.messages),
    "",
    "[Required JSON shape]",
    JSON.stringify(
      {
        segment_summary:
          '[YYYY.MM.DD] "4-8 sentence summary of ONLY the new messages from that date"; use multiple dated segments or same-month ranges like [2026.05.24~26] when needed.',
        summary_text:
          "8-12 sentence compact, deduplicated rolling summary of the useful conversation state.",
        key_points: ["durable user preference or fact"],
        open_loops: ["unresolved follow-up or decision"],
        do_not_repeat: ["context Harper should avoid repeating"],
        next_best_action: "one concise next action Harper should take",
      },
      null,
      2
    ),
  ].join("\n");
}

async function fetchLatestConversationSummary(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  return (data ?? null) as TalentConversationSummaryRow | null;
}

async function fetchLatestConversationSummaryCursor(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select("created_at, to_message_id")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  return (data ?? null) as TalentConversationSummaryCursorRow | null;
}

async function fetchRecentConversationSegmentSummaries(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit: number;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select("conversation_id, created_at, segment_summary, to_message_id")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .neq("segment_summary", "")
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, args.limit)) as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  return ((data ?? []) as TalentConversationSegmentSummaryRow[]).reverse();
}

export async function maybeSummarizeTalentConversation(args: {
  admin: TalentAdminClient;
  conversationId: string;
  maxToMessageId?: number | null;
  minMessageCount?: number;
  minSourceChars?: number;
  userId: string;
}) {
  const latestSummary = await fetchLatestConversationSummary(args);
  const allMessages = await fetchMessages({
    admin: args.admin,
    conversationId: args.conversationId,
  });
  const cappedVisibleMessages = allMessages.filter(
    (message) =>
      (typeof args.maxToMessageId === "number"
        ? message.id <= args.maxToMessageId
        : true) &&
      isVisibleSummaryRecentMessage(message) &&
      message.content.trim().length > 0
  );
  const summarizableMessages = cappedVisibleMessages.slice(
    0,
    Math.max(0, cappedVisibleMessages.length - MIN_RECENT_RAW_MESSAGES)
  );
  const sourceMessages = summarizableMessages.filter((message) =>
    latestSummary ? message.id > latestSummary.to_message_id : true
  );
  const sourceCharCount = sourceMessages.reduce(
    (sum, message) => sum + message.content.trim().length,
    0
  );
  const minMessageCount = args.minMessageCount ?? DEFAULT_MIN_MESSAGE_COUNT;
  const minSourceChars = args.minSourceChars ?? DEFAULT_MIN_SOURCE_CHARS;

  if (
    sourceMessages.length < minMessageCount &&
    sourceCharCount < minSourceChars
  ) {
    return { created: false, reason: "below_threshold" as const };
  }

  const summarizedMessages = selectSourceMessages(sourceMessages);
  if (summarizedMessages.length === 0) {
    return { created: false, reason: "no_messages" as const };
  }

  const raw = await runCareerConversationSummary({
    systemPrompt: buildSummarySystemPrompt(),
    userPrompt: buildSummaryUserPrompt({
      existingSummary: latestSummary,
      messages: summarizedMessages,
    }),
  });
  const parsed = parseJsonObject(raw) ?? {};
  const segmentSummary = normalizeText(parsed.segment_summary, 3000);
  const summaryText =
    normalizeText(parsed.summary_text, 6000) || normalizeText(raw, 6000);
  if (!summaryText) {
    return { created: false, reason: "empty_summary" as const };
  }

  const summaryJson = {
    do_not_repeat: normalizeStringArray(parsed.do_not_repeat),
    key_points: normalizeStringArray(parsed.key_points, 12),
    next_best_action: normalizeText(parsed.next_best_action, 800),
    open_loops: normalizeStringArray(parsed.open_loops),
  };
  const fromMessage = summarizedMessages[0];
  const toMessage = summarizedMessages[summarizedMessages.length - 1];
  const summarizedCharCount = summarizedMessages.reduce(
    (sum, message) => sum + message.content.trim().length,
    0
  );
  const currentLatestSummary = await fetchLatestConversationSummary(args);
  const previousToMessageId = latestSummary?.to_message_id ?? null;
  const currentToMessageId = currentLatestSummary?.to_message_id ?? null;

  if (currentToMessageId !== previousToMessageId) {
    return { created: false, reason: "stale_summary" as const };
  }

  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .upsert(
      {
        conversation_id: args.conversationId,
        from_message_id: fromMessage?.id ?? null,
        message_count: summarizedMessages.length,
        segment_summary: segmentSummary,
        source_char_count: summarizedCharCount,
        summary_json: summaryJson,
        summary_text: summaryText,
        talent_id: args.userId,
        to_message_id: toMessage.id,
      },
      { onConflict: "conversation_id,to_message_id" }
    )
    .select("*")
    .single() as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to save talent_conversation_summaries"
    );
  }

  return {
    created: true,
    summary: data as TalentConversationSummaryRow,
  };
}

function isVisibleSummaryRecentMessage(message: TalentMessageRow) {
  if (
    message.message_type ===
      TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION ||
    message.message_type === TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE ||
    message.message_type ===
      TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NEXT_STEPS ||
    message.message_type === TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP ||
    message.message_type === TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP
  ) {
    return false;
  }
  if (message.content.startsWith(TALENT_PENDING_QUESTION_PREFIX)) return false;
  return true;
}

function buildSegmentSummariesPseudoMessage(args: {
  conversationId: string;
  latestSummary: TalentConversationSummaryCursorRow;
  summaries: TalentConversationSegmentSummaryRow[];
  userId: string;
}): TalentMessageRow {
  return {
    content: [
      "[Recent conversation segment summaries]",
      ...args.summaries
        .map((summary, index) => {
          const text = normalizeText(summary.segment_summary, 3000);
          const date = formatSummaryRowDateForSummary(summary);
          return text
            ? `Segment ${index + 1}${date ? ` (${date} KST)` : ""}: ${text}`
            : "";
        })
        .filter(Boolean),
    ].join("\n"),
    conversation_id: args.conversationId,
    created_at: args.latestSummary.created_at,
    id: args.latestSummary.to_message_id,
    message_type: SUMMARY_MESSAGE_TYPE,
    role: "assistant",
    user_id: args.userId,
  };
}

export async function fetchRecentMessagesWithSummary(args: {
  admin: TalentAdminClient;
  conversationId: string;
  fallbackLimit?: number;
  recentLimit?: number;
  userId: string;
}) {
  const recentLimit = Math.max(
    MIN_RECENT_RAW_MESSAGES,
    Math.min(args.recentLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT, 40)
  );
  const latestSummary = await fetchLatestConversationSummaryCursor(args);
  if (!latestSummary) {
    return fetchRecentMessages({
      admin: args.admin,
      conversationId: args.conversationId,
      limit: args.fallbackLimit ?? 24,
    });
  }
  const segmentSummaries = await fetchRecentConversationSegmentSummaries({
    admin: args.admin,
    conversationId: args.conversationId,
    limit: 3,
    userId: args.userId,
  });

  const { data, error } = await args.admin
    .from("talent_messages")
    .select(
      "id, conversation_id, user_id, role, content, message_type, thinking_logs, created_at"
    )
    .eq("conversation_id", args.conversationId)
    .gt("id", latestSummary.to_message_id)
    .order("id", { ascending: false })
    .limit(recentLimit);

  if (error) {
    throw new Error(error.message ?? "Failed to load recent talent_messages");
  }

  let recentMessages = ((data ?? []) as TalentMessageRow[])
    .filter(isVisibleSummaryRecentMessage)
    .reverse();

  if (recentMessages.length < MIN_RECENT_RAW_MESSAGES) {
    const fallbackRecentMessages = (
      await fetchRecentMessages({
        admin: args.admin,
        conversationId: args.conversationId,
        limit: recentLimit,
      })
    ).filter(isVisibleSummaryRecentMessage);
    const messageById = new Map<number, TalentMessageRow>();
    for (const message of [...recentMessages, ...fallbackRecentMessages]) {
      messageById.set(message.id, message);
    }
    recentMessages = Array.from(messageById.values())
      .sort((left, right) => left.id - right.id)
      .slice(-recentLimit);
  }

  return [
    ...(segmentSummaries.length > 0
      ? [
          buildSegmentSummariesPseudoMessage({
            conversationId: args.conversationId,
            latestSummary,
            summaries: segmentSummaries,
            userId: args.userId,
          }),
        ]
      : []),
    ...recentMessages,
  ];
}
