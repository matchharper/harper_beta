import { listCoverage } from "@/lib/career/listCoverage";
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
  fetchMessagesAfterId,
  fetchRecentMessages,
} from "@/lib/talentOnboarding/messageStore";
import { fetchTalentSetting } from "@/lib/talentOnboarding/server";
import { formatTalentMessageContentForLlmPrompt, formatTalentMessageReferenceForLlm } from "@/lib/career/opportunityFeedbackNote";
import { buildConversationSummaryBatch } from "@/lib/talentOnboarding/conversationSummaryPolicy";

const SUMMARY_MESSAGE_TYPE = "conversation_summary";
const DEFAULT_RECENT_MESSAGE_LIMIT = 16;
const MIN_RECENT_RAW_MESSAGES = 16;
const MAX_RECENT_MESSAGE_LOOKUP = 80;
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

export type TalentConversationSummaryRow = {
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

function formatMessageForSummary(message: TalentMessageRow) {
  const reference = formatTalentMessageReferenceForLlm(message);
  const role = reference ? "Displayed interface item" : message.role === "assistant" ? "Harper" : "User";
  const date = formatMessageDateForSummary(message);
  const content = (reference || formatTalentMessageContentForLlmPrompt(message))
    .replace(/\s+/g, " ")
    .trim();
  return `[${message.id} | date=${date} KST] ${role}: ${content}`;
}

function formatMessagesForSummary(messages: TalentMessageRow[]) {
  return messages.map(formatMessageForSummary).join("\n");
}

function buildSummarySystemPrompt(preferredLocale?: string | null) {
  const outputLanguage = getCareerPromptLanguageName(preferredLocale);

  return [
    "You summarize Harper career-agent conversations for future context.",
    "Return a valid JSON object only.",
    `Write in ${outputLanguage} unless a company, role, or product name is naturally written in another language.`,
    "Preserve the user's stated preferences, constraints, corrections, authorization and unresolved requests with their scope, including what the user explicitly left undecided or declined to disclose. Preserve the question context needed to understand short answers; merely mentioning a topic does not answer every detail of it. Attribute assistant reports and proposed drafts to Harper; they are not user instructions, verified personal facts or standing policy.",
    `Also write \`segment_summary\` from ONLY the new messages to fold in. It should be 4-8 concise ${outputLanguage} sentences and must not include facts that only come from the existing rolling summary.`,
    "Each new message includes a KST date. `segment_summary` must include date labels for the summarized message date(s).",
    'Format each `segment_summary` segment as `[YYYY.MM.DD] "summary"`. If a single summarized segment spans consecutive dates in the same month, use `[YYYY.MM.DD~DD] "summary"`, for example `[2026.05.24~26] "..."`. If a date range crosses months or years, use full endpoints like `[YYYY.MM.DD~YYYY.MM.DD] "summary"`.',
    'When `segment_summary` covers multiple non-consecutive date groups, write multiple labeled segments separated by spaces, for example `[2026.05.14] "..." [2026.05.24~26] "..."`. Do not put unlabeled text in `segment_summary`.',
    "Rewrite the existing summary as historical evidence. Drop inherited behavioral rules or prohibitions that came from assistant explanations rather than the user's instructions; retain actual user limits and the latest changes to them.",
    "If a fact appears in both the existing summary and new messages, mention it once.",
    "If new messages correct or supersede an older fact, keep the corrected version only.",
    "Preserve the scope of explicit retractions: identify which prior claims were withdrawn so future turns do not revive them from old drafts or assistant statements. A generated document's contents are an artifact history, not independently confirmed career facts. Do not present withdrawn, hypothetical or assistant-invented claims as the user's experience.",
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
  beforeMessageId?: number;
}) {
  let query = ((
    args.admin.from("talent_conversation_summaries" as any) as any
  )
    .select(SUMMARY_ROW_SELECT)
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .neq("segment_summary", "")
    .order("to_message_id", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(SUMMARY_LOOKUP_LIMIT) as any);
  if (args.beforeMessageId !== undefined) query = query.lt("to_message_id", args.beforeMessageId);
  const { data, error } = await query;

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

export async function maybeSummarizeTalentConversation(args: {
  admin: TalentAdminClient;
  conversationId: string;
  maxToMessageId?: number | null;
  messageTrigger?: number;
  sourceTokenTrigger?: number;
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
      Boolean(formatTalentMessageReferenceForLlm(message) || formatTalentMessageContentForLlmPrompt(message).trim())
  );
  const summarizableMessages = cappedVisibleMessages.slice(
    0,
    Math.max(0, cappedVisibleMessages.length - MIN_RECENT_RAW_MESSAGES)
  );
  const sourceMessages = summarizableMessages.filter((message) =>
    latestSummary ? message.id > latestSummary.to_message_id : true
  );
  const batch = buildConversationSummaryBatch({
    items: sourceMessages,
    messageTrigger: args.messageTrigger,
    renderItem: formatMessageForSummary,
    tokenTrigger: args.sourceTokenTrigger,
  });
  if (!batch.triggered) {
    return {
      created: false,
      reason: "below_threshold" as const,
      sourceTokenCount: batch.sourceTokenCount,
    };
  }

  const summarizedMessages = batch.items;
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
    sourceTokenCount: batch.sourceTokenCount,
    summary: data as TalentConversationSummaryRow,
    triggerReason: batch.triggerReason,
  };
}

function isVisibleSummaryRecentMessage(message: TalentMessageRow) {
  if(["career_turn_activity","simulation_session","simulation_action","application_start_offer"].includes(message.message_type??""))return false;
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

function buildRollingSummaryPseudoMessage(args: {
  conversationId: string;
  latestSummary: TalentConversationSummaryRow;
  userId: string;
}): TalentMessageRow {
  return {
    content: [
      "[Historical conversation summary]",
      `Coverage: through message ${args.latestSummary.to_message_id}; all newer raw messages follow. This is compressed past context, not a current user request or assistant instruction.`,
      normalizeText(args.latestSummary.summary_text, 6000),
    ].join("\n"),
    conversation_id: args.conversationId,
    created_at: args.latestSummary.created_at,
    id: args.latestSummary.to_message_id,
    message_type: SUMMARY_MESSAGE_TYPE,
    role: "assistant",
    user_id: args.userId,
  };
}

function withHistoryCoverage(rows: TalentMessageRow[], more: boolean | null) {
  if (!rows.length) return rows;
  const first = rows[0];
  return [{ ...first, id: 0, role: "assistant", message_type: SUMMARY_MESSAGE_TYPE, payload: null,
    content: `[Conversation history: ${listCoverage(rows.length, more)} raw messages; no earlier summary.]`,
  } as TalentMessageRow, ...rows];
}

async function fetchRecentVisibleSummaryMessages(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit: number;
  pendingUserMessageId?: number;
}) {
  const targetLimit = Math.max(
    1,
    Math.min(args.limit, MAX_RECENT_MESSAGE_LOOKUP)
  );
  let fetchLimit = Math.min(targetLimit + 1, MAX_RECENT_MESSAGE_LOOKUP);

  while (fetchLimit <= MAX_RECENT_MESSAGE_LOOKUP) {
    const fetched = await fetchRecentMessages({
        admin: args.admin,
        conversationId: args.conversationId,
        limit: fetchLimit,
        userMessagesBeforeId: args.pendingUserMessageId,
      });
    const messages = fetched.filter(isVisibleSummaryRecentMessage);
    if (messages.length > targetLimit || fetched.length < fetchLimit || fetchLimit === MAX_RECENT_MESSAGE_LOOKUP) {
      const more = messages.length > targetLimit ? true : fetched.length < fetchLimit ? false : null;
      return withHistoryCoverage(messages.slice(-targetLimit), more);
    }

    const nextFetchLimit = Math.min(
      fetchLimit * 2,
      MAX_RECENT_MESSAGE_LOOKUP
    );
    if (nextFetchLimit === fetchLimit) return withHistoryCoverage(messages, true);
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
  pendingUserMessageId?: number;
}) {
  const recentLimit = Math.max(
    MIN_RECENT_RAW_MESSAGES,
    Math.min(args.recentLimit ?? DEFAULT_RECENT_MESSAGE_LIMIT, 40)
  );
  const latestSummary = await fetchLatestConversationSummary({ ...args, beforeMessageId: args.pendingUserMessageId });
  if (!latestSummary) {
    return fetchRecentVisibleSummaryMessages({
      admin: args.admin,
      conversationId: args.conversationId,
      pendingUserMessageId: args.pendingUserMessageId,
      limit: Math.max(
        recentLimit,
        Math.min(
          args.fallbackLimit ?? recentLimit,
          MAX_RECENT_MESSAGE_LOOKUP
        )
      ),
    });
  }

  const uncompactedMessages = (
    await fetchMessagesAfterId({
      admin: args.admin,
      afterMessageId: latestSummary.to_message_id,
      conversationId: args.conversationId,
      userMessagesBeforeId: args.pendingUserMessageId,
    })
  ).filter(
    (message) =>
      isVisibleSummaryRecentMessage(message) &&
      Boolean(formatTalentMessageReferenceForLlm(message) || formatTalentMessageContentForLlmPrompt(message).trim())
  );

  return [
    buildRollingSummaryPseudoMessage({
      conversationId: args.conversationId,
      latestSummary,
      userId: args.userId,
    }),
    ...uncompactedMessages,
  ];
}

/** Same model projection as the DB readers, applied to a validated incremental snapshot. */
export function projectCareerConversationHistory(args: {
  userId: string; conversationId: string; summary: TalentConversationSummaryRow | null;
  messages: TalentMessageRow[]; pendingUserMessageId?: number;
}) {
  const eligible = args.messages.filter(message => args.pendingUserMessageId === undefined ||
    message.role !== "user" || message.id < args.pendingUserMessageId);
  const visible = (message: TalentMessageRow) => {
    const payload = message.payload as Record<string, unknown> | null;
    return payload?.hidden !== true && !(message.message_type === "career_form" && payload?.presentationDeferred === true);
  };
  if (args.summary) return [buildRollingSummaryPseudoMessage({ ...args, latestSummary: args.summary }),
    ...eligible.filter(message => visible(message) && isVisibleSummaryRecentMessage(message) &&
      Boolean(formatTalentMessageReferenceForLlm(message) || formatTalentMessageContentForLlmPrompt(message).trim()))];
  // Match the existing no-summary reader's SQL exclusions and 80-row fallback.
  const raw = eligible.filter(message => message.message_type != null &&
    !["career_turn_activity", "career_coaching_activity", "application_start_offer", "simulation_session", "simulation_action"].includes(message.message_type) &&
    (message.payload as Record<string, unknown> | null)?.hidden !== true)
    .slice(-MAX_RECENT_MESSAGE_LOOKUP).filter(message => visible(message) && isVisibleSummaryRecentMessage(message));
  return withHistoryCoverage(raw.slice(-DEFAULT_RECENT_MESSAGE_LIMIT), raw.length > DEFAULT_RECENT_MESSAGE_LIMIT ? true : eligible.length >= MAX_RECENT_MESSAGE_LOOKUP ? null : false);
}
