import { runCareerConversationSummary } from "@/lib/career/llm";
import { getCareerPromptLanguageName } from "@/lib/career/promptLocale";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  TALENT_PENDING_QUESTION_PREFIX,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  TALENT_MESSAGE_TYPE_ONBOARDING_ADDITIONAL_QUESTION_SELECTION,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_NOTICE,
  TALENT_MESSAGE_TYPE_ONBOARDING_COMPLETION_WRAPUP,
  TALENT_MESSAGE_TYPE_SESSION_REENGAGEMENT_SKIP,
} from "@/lib/talentOnboarding/onboarding";
import {
  fetchMessages,
  fetchRecentMessages,
} from "@/lib/talentOnboarding/messageStore";
import { fetchTalentSetting } from "@/lib/talentOnboarding/server";
import { formatTalentMessageContentForLlmPrompt } from "@/lib/career/opportunityFeedbackNote";

const SUMMARY_MESSAGE_TYPE = "conversation_summary";
const DEFAULT_MIN_MESSAGE_COUNT = 14;
const DEFAULT_MIN_SOURCE_CHARS = 5000;
const DEFAULT_RECENT_MESSAGE_LIMIT = 16;
const MIN_RECENT_RAW_MESSAGES = 16;
const MAX_SOURCE_MESSAGES = 80;
const MAX_SOURCE_CHARS = 18000;
const SUMMARY_LOOKUP_LIMIT = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SUMMARY_ROW_SELECT = `
  id,
  talent_id,
  conversation_id,
  from_message_id,
  to_message_id,
  message_count,
  segment_summary,
  source_char_count,
  summary_text,
  created_at
`;

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

function buildSummarySystemPrompt(preferredLocale?: string | null) {
  const outputLanguage = getCareerPromptLanguageName(preferredLocale);

  return [
    "You summarize Harper career-agent conversations for future context.",
    "Return a valid JSON object only.",
    `Write in ${outputLanguage} unless a company, role, or product name is naturally written in another language.`,
    "Preserve durable facts: career preferences, constraints, corrections, recommendation feedback, and unresolved commitments already stated in the conversation.",
    `Also write \`segment_summary\` from ONLY the new messages to fold in. It should be 4-8 concise ${outputLanguage} sentences and must not include facts that only come from the existing rolling summary.`,
    "Each new message includes a KST date. `segment_summary` must include date labels for the summarized message date(s).",
    'Format each `segment_summary` segment as `[YYYY.MM.DD] "summary"`. If a single summarized segment spans consecutive dates in the same month, use `[YYYY.MM.DD~DD] "summary"`, for example `[2026.05.24~26] "..."`. If a date range crosses months or years, use full endpoints like `[YYYY.MM.DD~YYYY.MM.DD] "summary"`.',
    'When `segment_summary` covers multiple non-consecutive date groups, write multiple labeled segments separated by spaces, for example `[2026.05.14] "..." [2026.05.24~26] "..."`. Do not put unlabeled text in `segment_summary`.',
    "Treat the existing summary as prior state to merge and rewrite, not text to append.",
    "If a fact appears in both the existing summary and new messages, mention it once.",
    "If new messages correct or supersede an older fact, keep the corrected version only.",
    "Opportunity feedback notes such as saved/dismissed roles are action logs, not full user utterances. Compact many similar feedback notes into concise preference/status changes; do not let role-save logs dominate the summary.",
    "Do not invent facts. Do not include routine greetings or filler.",
  ].join("\n");
}

function buildSummaryUserPrompt(args: {
  existingSummary: TalentConversationSummaryRow | null;
  messages: TalentMessageRow[];
}) {
  return [
    args.existingSummary
      ? ["[Existing rolling summary]", args.existingSummary.summary_text].join(
          "\n"
        )
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
    .select(SUMMARY_ROW_SELECT)
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .neq("segment_summary", "")
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SUMMARY_LOOKUP_LIMIT) as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  return (
    ((data ?? []) as TalentConversationSummaryRow[]).find((row) =>
      Boolean(normalizeText(row.segment_summary, 1))
    ) ?? null
  );
}

async function fetchLatestConversationSummaryCursor(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select("created_at, segment_summary, to_message_id")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .neq("segment_summary", "")
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SUMMARY_LOOKUP_LIMIT) as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to load talent_conversation_summaries"
    );
  }

  const summary =
    (
      (data ?? []) as Array<
        TalentConversationSummaryCursorRow & { segment_summary?: string | null }
      >
    ).find((row) => Boolean(normalizeText(row.segment_summary, 1))) ?? null;

  return summary
    ? {
        created_at: summary.created_at,
        to_message_id: summary.to_message_id,
      }
    : null;
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
  const talentSetting = await fetchTalentSetting({
    admin: args.admin,
    userId: args.userId,
  });

  const raw = await runCareerConversationSummary({
    systemPrompt: buildSummarySystemPrompt(talentSetting?.preferred_locale),
    userPrompt: buildSummaryUserPrompt({
      existingSummary: latestSummary,
      messages: summarizedMessages,
    }),
  });
  const parsed = parseJsonObject(raw);
  if (!parsed) {
    return { created: false, reason: "invalid_summary" as const };
  }
  const segmentSummary = normalizeText(parsed.segment_summary, 3000);
  const summaryText = normalizeText(parsed.summary_text, 6000);
  if (!segmentSummary || !summaryText) {
    return { created: false, reason: "empty_summary" as const };
  }

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
        summary_text: summaryText,
        talent_id: args.userId,
        to_message_id: toMessage.id,
      },
      { onConflict: "conversation_id,to_message_id" }
    )
    .select(SUMMARY_ROW_SELECT)
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

async function fetchRecentVisibleSummaryMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit: number;
}) {
  const targetLimit = Math.max(1, Math.min(args.limit, MAX_SOURCE_MESSAGES));
  let fetchLimit = targetLimit;

  while (fetchLimit <= MAX_SOURCE_MESSAGES) {
    const messages = (
      await fetchRecentMessages({
        admin: args.admin,
        conversationId: args.conversationId,
        limit: fetchLimit,
      })
    ).filter(isVisibleSummaryRecentMessage);

    if (messages.length >= targetLimit || fetchLimit === MAX_SOURCE_MESSAGES) {
      return messages.slice(-targetLimit);
    }

    const nextFetchLimit = Math.min(fetchLimit * 2, MAX_SOURCE_MESSAGES);
    if (nextFetchLimit === fetchLimit) return messages;
    fetchLimit = nextFetchLimit;
  }

  return [];
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
  const rawRecentLimit = latestSummary
    ? recentLimit
    : Math.max(
        recentLimit,
        Math.min(args.fallbackLimit ?? recentLimit, MAX_SOURCE_MESSAGES)
      );
  const recentMessages = await fetchRecentVisibleSummaryMessages({
    admin: args.admin,
    conversationId: args.conversationId,
    limit: rawRecentLimit,
  });
  if (!latestSummary) {
    return recentMessages;
  }
  const segmentSummaries = await fetchRecentConversationSegmentSummaries({
    admin: args.admin,
    conversationId: args.conversationId,
    limit: 3,
    userId: args.userId,
  });

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
