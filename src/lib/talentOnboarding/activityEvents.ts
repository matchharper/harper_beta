import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type {
  TalentOpportunityFeedback,
  TalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import { getTalentEngagementLabels } from "@/lib/talentNetworkOptions";
import { logger } from "@/utils/logger";

export type TalentActivityImpactLevel = "low" | "medium" | "high";

export type TalentActivityEventRow = {
  id: string;
  talent_id: string;
  conversation_id: string | null;
  message_id: number | null;
  source: string;
  event_type: string;
  summary: string;
  impact_level: TalentActivityImpactLevel;
  changed_domains: string[];
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type TalentActivitySummaryRow = Pick<
  TalentActivityEventRow,
  "created_at" | "summary"
>;

export type TalentActivityChange = {
  field: string;
  from: unknown;
  to: unknown;
};

export type TalentRowMemoActivityItem = {
  entityId?: string | number | null;
  entityLabel: string;
  entityType: "education" | "experience" | "extra";
  newInfo: string;
};

export const TALENT_ACTIVITY_EVENT_TYPE_OPPORTUNITY_FEEDBACK =
  "opportunity_feedback";

export type TalentOpportunityFeedbackActivityItem = {
  action: TalentOpportunityFeedback;
  companyName: string | null;
  eventId: string;
  feedbackReason: string | null;
  href: string | null;
  location: string | null;
  occurredAt: string;
  opportunityId: string | null;
  opportunityType: string | null;
  recommendationConcerns: string[];
  recommendationReasons: string[];
  recommendationSummary: string | null;
  roleId: string | null;
  sourceType: "internal" | "external" | null;
  title: string | null;
  workMode: string | null;
};

const IMPACT_LEVELS = new Set<TalentActivityImpactLevel>([
  "low",
  "medium",
  "high",
]);

const PREFERENCE_FIELD_LABELS: Record<string, string> = {
  engagementTypes: "engagement types",
  getExternalRecommendation: "external recommendations",
  getInternalRecommendation: "internal recommendations",
  periodicIntervalDays: "periodic interval days",
  recommendationBatchSize: "recommendation batch size",
};

const HIDDEN_TALENT_SETTING_SUMMARY_PATTERNS = [
  "engagement types",
  "engagementtypes",
];

function normalizeMessageId(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeImpactLevel(
  value: TalentActivityImpactLevel | null | undefined
): TalentActivityImpactLevel {
  return value && IMPACT_LEVELS.has(value) ? value : "low";
}

function normalizeChangedDomains(value: readonly string[] | null | undefined) {
  return Array.from(
    new Set(
      (value ?? [])
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    )
  );
}

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0)
      .sort();
  }
  if (typeof value === "string") return value.trim();
  return value ?? null;
}

function clampText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function formatActivityValue(value: unknown) {
  const normalized = normalizeComparableValue(value);
  if (Array.isArray(normalized)) {
    return normalized.length > 0 ? `[${normalized.join(", ")}]` : "none";
  }
  if (normalized === null || normalized === undefined || normalized === "") {
    return "none";
  }
  if (typeof normalized === "object") {
    return clampText(JSON.stringify(normalized), 180);
  }
  return clampText(String(normalized), 180);
}

function formatLabeledArray(labels: string[], fallbackValue: unknown) {
  return labels.length > 0
    ? `[${labels.join(", ")}]`
    : formatActivityValue(fallbackValue);
}

function formatPreferenceActivityValue(field: string, value: unknown) {
  if (field === "engagementTypes") {
    return formatLabeledArray(getTalentEngagementLabels(value), value);
  }
  if (field === "periodicIntervalDays") {
    const formatted = formatActivityValue(value);
    return formatted === "none" ? formatted : `${formatted} days`;
  }
  if (field === "recommendationBatchSize") {
    const formatted = formatActivityValue(value);
    return formatted === "none" ? formatted : `${formatted} opportunities`;
  }
  if (
    field === "getExternalRecommendation" ||
    field === "getInternalRecommendation"
  ) {
    if (value === true) return "enabled";
    if (value === false) return "disabled";
  }
  return formatActivityValue(value);
}

function containsHiddenTalentSettingSummary(summary: string) {
  const normalized = summary.toLowerCase();
  return HIDDEN_TALENT_SETTING_SUMMARY_PATTERNS.some((pattern) =>
    normalized.includes(pattern)
  );
}

function formatQuotedValue(value: string) {
  return `"${clampText(value, 180).replaceAll('"', "'")}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getOptionalString(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function getStringList(value: unknown, limit = 4) {
  return Array.isArray(value)
    ? value
        .map((entry) =>
          String(entry ?? "")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function parseFeedbackReasonText(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      customReason?: unknown;
      selectedOptions?: unknown;
    };
    const selectedOptions = Array.isArray(parsed.selectedOptions)
      ? parsed.selectedOptions
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];
    const customReason =
      typeof parsed.customReason === "string" ? parsed.customReason.trim() : "";
    const combined = [...selectedOptions, customReason]
      .filter(Boolean)
      .join(" / ");
    return combined || null;
  } catch {
    return raw;
  }
}

function getPreferenceFieldLabel(field: string) {
  return PREFERENCE_FIELD_LABELS[field] ?? field;
}

export function isSameActivityValue(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeComparableValue(left)) ===
    JSON.stringify(normalizeComparableValue(right))
  );
}

export function compactActivityChanges(
  changes: readonly TalentActivityChange[]
) {
  return changes.filter(
    (change) => !isSameActivityValue(change.from, change.to)
  );
}

export function buildPreferenceActivitySummary(
  changes: readonly TalentActivityChange[]
) {
  const compactChanges = compactActivityChanges(changes);
  if (compactChanges.length === 0) return null;

  const details = compactChanges.map(
    (change) =>
      `${getPreferenceFieldLabel(change.field)} from ${formatPreferenceActivityValue(
        change.field,
        change.from
      )} to ${formatPreferenceActivityValue(change.field, change.to)}`
  );

  if (details.length === 1) {
    return `User changed ${details[0]}.`;
  }

  return `User updated recommendation preferences: ${details.join("; ")}.`;
}

export function toPreferenceActivityDisplayChanges(
  changes: readonly TalentActivityChange[]
) {
  return compactActivityChanges(changes).map((change) => ({
    field: getPreferenceFieldLabel(change.field),
    from: formatPreferenceActivityValue(change.field, change.from),
    to: formatPreferenceActivityValue(change.field, change.to),
  }));
}

export function getPreferenceActivityImpact(
  changes: readonly TalentActivityChange[]
): TalentActivityImpactLevel {
  const highImpactFields = new Set([
    "engagementTypes",
    "getExternalRecommendation",
    "getInternalRecommendation",
  ]);
  return changes.some((change) => highImpactFields.has(change.field))
    ? "high"
    : "low";
}

export function buildInsightActivitySummary(keys: readonly string[]) {
  const normalizedKeys = Array.from(
    new Set(keys.map((key) => key.trim()).filter((key) => key.length > 0))
  );
  if (normalizedKeys.length === 0) return null;
  return `User updated Harper insights: ${normalizedKeys.join(", ")}.`;
}

export function buildRowMemoActivitySummary(
  items: readonly TalentRowMemoActivityItem[]
) {
  const normalizedItems = items.filter(
    (item) => item.entityLabel.trim() && item.newInfo.trim()
  );
  if (normalizedItems.length === 0) return null;

  if (normalizedItems.length === 1) {
    const item = normalizedItems[0];
    return `User added a memo to ${item.entityType} "${clampText(
      item.entityLabel,
      120
    )}": ${formatQuotedValue(item.newInfo)}.`;
  }

  const details = normalizedItems
    .slice(0, 4)
    .map(
      (item) =>
        `${item.entityType} "${clampText(item.entityLabel, 80)}": ${formatQuotedValue(
          item.newInfo
        )}`
    );
  const suffix =
    normalizedItems.length > details.length
      ? `; plus ${normalizedItems.length - details.length} more`
      : "";
  return `User added memos to profile rows: ${details.join("; ")}${suffix}.`;
}

export async function insertTalentActivityEvent(args: {
  admin: TalentAdminClient;
  changedDomains?: readonly string[] | null;
  conversationId?: string | null;
  eventType: string;
  impactLevel?: TalentActivityImpactLevel | null;
  messageId?: number | string | null;
  metadata?: Record<string, unknown> | null;
  occurredAt?: string | null;
  relatedEntityId?: string | number | null;
  relatedEntityType?: string | null;
  source: string;
  summary: string | null | undefined;
  userId: string;
}) {
  const summary = clampText(args.summary ?? "", 1200);
  if (!summary) return false;

  try {
    const { error } = (await ((
      args.admin.from("talent_activity_events" as any) as any
    ).insert({
      changed_domains: normalizeChangedDomains(args.changedDomains),
      conversation_id: args.conversationId ?? null,
      event_type: args.eventType,
      impact_level: normalizeImpactLevel(args.impactLevel),
      message_id: normalizeMessageId(args.messageId),
      metadata: args.metadata ?? {},
      occurred_at: args.occurredAt ?? new Date().toISOString(),
      related_entity_id:
        args.relatedEntityId === undefined || args.relatedEntityId === null
          ? null
          : String(args.relatedEntityId),
      related_entity_type: args.relatedEntityType ?? null,
      source: args.source,
      summary,
      talent_id: args.userId,
    }) as any)) as { error: { message?: string } | null };

    if (error) {
      throw new Error(error.message ?? "Failed to insert activity event");
    }
    return true;
  } catch (error) {
    console.error("[TalentActivityEvent] Failed to insert activity event", {
      error: error instanceof Error ? error.message : String(error),
      eventType: args.eventType,
      userId: args.userId,
    });
    return false;
  }
}

export function buildOpportunityFeedbackActivitySummary(args: {
  action: TalentOpportunityFeedback;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
}) {
  const actionLabel = args.action === "positive" ? "liked" : "disliked";
  const sourceLabel =
    args.opportunity.sourceType === "internal" ? "internal" : "external";
  const reasonText = parseFeedbackReasonText(args.feedbackReason);
  const details = [
    args.opportunity.location ? `location=${args.opportunity.location}` : "",
    args.opportunity.workMode ? `workMode=${args.opportunity.workMode}` : "",
    args.opportunity.recommendationSummary
      ? `fit=${args.opportunity.recommendationSummary}`
      : "",
    args.opportunity.recommendationReasons[0]
      ? `reason=${args.opportunity.recommendationReasons[0]}`
      : "",
  ].filter(Boolean);

  return clampText(
    [
      `User ${actionLabel} ${sourceLabel} opportunity "${args.opportunity.title}" at "${args.opportunity.companyName}".`,
      reasonText ? `Feedback reason: ${reasonText}.` : "No feedback reason.",
      details.length > 0 ? `Opportunity details: ${details.join("; ")}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
    1200
  );
}

function buildOpportunityFeedbackActivityMetadata(args: {
  action: TalentOpportunityFeedback;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
}) {
  return {
    action: args.action,
    companyName: args.opportunity.companyName,
    feedbackReason: parseFeedbackReasonText(args.feedbackReason),
    href: args.opportunity.href,
    location: args.opportunity.location,
    opportunityId: args.opportunity.id,
    opportunityType: args.opportunity.opportunityType,
    recommendationConcerns: args.opportunity.recommendationConcerns,
    recommendationReasons: args.opportunity.recommendationReasons,
    recommendationSummary: args.opportunity.recommendationSummary,
    roleId: args.opportunity.roleId,
    sourceType: args.opportunity.sourceType,
    title: args.opportunity.title,
    workMode: args.opportunity.workMode,
  };
}

export async function insertTalentOpportunityFeedbackActivityEvent(args: {
  action: TalentOpportunityFeedback;
  admin: TalentAdminClient;
  conversationId?: string | null;
  feedbackReason?: string | null;
  opportunity: TalentOpportunityHistoryItem;
  userId: string;
}) {
  return insertTalentActivityEvent({
    admin: args.admin,
    changedDomains: ["opportunity_feedback", "recommendation_preferences"],
    conversationId: args.conversationId ?? null,
    eventType: TALENT_ACTIVITY_EVENT_TYPE_OPPORTUNITY_FEEDBACK,
    impactLevel:
      args.action === "negative" || args.opportunity.sourceType === "internal"
        ? "medium"
        : "low",
    metadata: buildOpportunityFeedbackActivityMetadata({
      action: args.action,
      feedbackReason: args.feedbackReason,
      opportunity: args.opportunity,
    }),
    relatedEntityId: args.opportunity.id,
    relatedEntityType: "talent_opportunity_recommendation",
    source: "career_opportunity_feedback",
    summary: buildOpportunityFeedbackActivitySummary({
      action: args.action,
      feedbackReason: args.feedbackReason,
      opportunity: args.opportunity,
    }),
    userId: args.userId,
  });
}

export async function fetchLatestTalentActivityEvent(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  eventType?: string;
  userId: string;
}) {
  try {
    let query = (args.admin.from("talent_activity_events" as any) as any)
      .select("*")
      .eq("talent_id", args.userId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    if (args.conversationId) {
      query = query.eq("conversation_id", args.conversationId);
    }

    const { data, error } = (await query) as {
      data: TalentActivityEventRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new Error(error.message ?? "Failed to load talent_activity_events");
    }

    const rows = Array.isArray(data) ? data : [];
    if (!args.eventType) return rows[0] ?? null;

    return rows.find((row) => row.event_type === args.eventType) ?? null;
  } catch (error) {
    console.error("[TalentActivityEvent] Failed to fetch activity events", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return null;
  }
}

export async function fetchTalentActivityEvents(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  eventTypes?: readonly string[] | null;
  limit?: number;
  since?: string | null;
  userId: string;
}) {
  try {
    let query = (args.admin.from("talent_activity_events" as any) as any)
      .select("*")
      .eq("talent_id", args.userId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(50, Math.floor(args.limit ?? 10))));

    if (args.since) {
      query = query.gte("occurred_at", args.since);
    }
    if (args.conversationId) {
      query = query.eq("conversation_id", args.conversationId);
    }
    if (args.eventTypes && args.eventTypes.length > 0) {
      query = query.in("event_type", args.eventTypes);
    }

    const { data, error } = (await query) as {
      data: TalentActivityEventRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new Error(error.message ?? "Failed to load talent_activity_events");
    }

    return Array.isArray(data)
      ? data.filter(
          (row) => !containsHiddenTalentSettingSummary(row.summary ?? "")
        )
      : [];
  } catch (error) {
    console.error("[TalentActivityEvent] Failed to fetch activity events", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return [];
  }
}

async function fetchLatestAssistantChatMessageCreatedAt(args: {
  admin: TalentAdminClient;
  conversationId: string;
  userId: string;
}) {
  try {
    const { data, error } = await args.admin
      .from("talent_messages")
      .select("created_at")
      .eq("conversation_id", args.conversationId)
      .eq("user_id", args.userId)
      .eq("role", "assistant")
      .eq("message_type", "chat")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? "Failed to load latest assistant chat");
    }

    return typeof data?.created_at === "string" ? data.created_at : null;
  } catch (error) {
    console.error("[TalentActivityEvent] Failed to fetch latest assistant", {
      conversationId: args.conversationId,
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return null;
  }
}

function toOpportunityFeedbackActivityItem(
  row: TalentActivityEventRow
): TalentOpportunityFeedbackActivityItem | null {
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const action = metadata.action;
  if (action !== "positive" && action !== "negative") return null;
  const sourceType = metadata.sourceType;

  return {
    action,
    companyName: getOptionalString(metadata.companyName),
    eventId: row.id,
    feedbackReason: getOptionalString(metadata.feedbackReason),
    href: getOptionalString(metadata.href),
    location: getOptionalString(metadata.location),
    occurredAt: row.occurred_at,
    opportunityId: getOptionalString(metadata.opportunityId),
    opportunityType: getOptionalString(metadata.opportunityType),
    recommendationConcerns: getStringList(metadata.recommendationConcerns, 3),
    recommendationReasons: getStringList(metadata.recommendationReasons, 4),
    recommendationSummary: getOptionalString(metadata.recommendationSummary),
    roleId: getOptionalString(metadata.roleId),
    sourceType:
      sourceType === "internal" || sourceType === "external"
        ? sourceType
        : null,
    title: getOptionalString(metadata.title),
    workMode: getOptionalString(metadata.workMode),
  };
}

function dedupeLatestFeedbackByOpportunity(
  items: TalentOpportunityFeedbackActivityItem[]
) {
  const byKey = new Map<string, TalentOpportunityFeedbackActivityItem>();
  for (const item of items) {
    const key = item.opportunityId ?? item.eventId;
    if (byKey.has(key)) {
      byKey.delete(key);
    }
    byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

export async function fetchPendingOpportunityFeedbackActivityItems(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit?: number;
  userId: string;
}) {
  const latestAssistantCreatedAt =
    await fetchLatestAssistantChatMessageCreatedAt({
      admin: args.admin,
      conversationId: args.conversationId,
      userId: args.userId,
    });
  const latestAssistantTime = Date.parse(latestAssistantCreatedAt ?? "");
  const rows = await fetchTalentActivityEvents({
    admin: args.admin,
    conversationId: args.conversationId,
    eventTypes: [TALENT_ACTIVITY_EVENT_TYPE_OPPORTUNITY_FEEDBACK],
    limit: args.limit ?? 10,
    since: latestAssistantCreatedAt,
    userId: args.userId,
  });

  const items = rows
    .filter((row) => {
      if (!Number.isFinite(latestAssistantTime)) return true;
      const occurredAt = Date.parse(row.occurred_at);
      return Number.isFinite(occurredAt) && occurredAt > latestAssistantTime;
    })
    .map(toOpportunityFeedbackActivityItem)
    .filter(
      (item): item is TalentOpportunityFeedbackActivityItem => item !== null
    )
    .reverse();

  return dedupeLatestFeedbackByOpportunity(items);
}

export function formatOpportunityFeedbackPromptContext(
  items: readonly TalentOpportunityFeedbackActivityItem[]
) {
  if (items.length === 0) return "";

  const positiveCount = items.filter(
    (item) => item.action === "positive"
  ).length;
  const negativeCount = items.filter(
    (item) => item.action === "negative"
  ).length;
  const missingReasonCount = items.filter(
    (item) => !item.feedbackReason
  ).length;

  const lines = items.slice(0, 8).map((item, index) => {
    const actionLabel = item.action === "positive" ? "liked" : "disliked";
    const roleLabel = [
      item.title,
      item.companyName ? `at ${item.companyName}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const details = [
      item.sourceType ? `source=${item.sourceType}` : "",
      item.opportunityType ? `type=${item.opportunityType}` : "",
      item.location ? `location=${item.location}` : "",
      item.workMode ? `workMode=${item.workMode}` : "",
      item.feedbackReason ? `reason=${item.feedbackReason}` : "reason=(none)",
      item.recommendationSummary ? `fit=${item.recommendationSummary}` : "",
      item.recommendationReasons[0]
        ? `recommendedBecause=${item.recommendationReasons[0]}`
        : "",
      item.recommendationConcerns[0]
        ? `concern=${item.recommendationConcerns[0]}`
        : "",
    ].filter(Boolean);

    return `- ${index + 1}. ${actionLabel}: ${roleLabel || "(unknown opportunity)"}; ${details.join("; ")}`;
  });

  logger.log(
    "\n\n\n## Pending opportunity feedback since Harper last replied\n\n\n"
  );

  return [
    "## Pending opportunity feedback since Harper last replied",
    "Use this live context in the next answer. Incorporate it briefly before or inside the answer unless doing so would be incoherent. If the user's latest message is related to recommendations, acknowledge the pattern and ask at most one concrete calibration question. Do not mention logs, timers, or implementation details.",
    `Total=${items.length}; liked=${positiveCount}; disliked=${negativeCount}; noReason=${missingReasonCount}.`,
    ...lines,
  ].join("\n");
}

export async function fetchPendingOpportunityFeedbackPromptContext(args: {
  admin: TalentAdminClient;
  conversationId: string;
  limit?: number;
  userId: string;
}) {
  const items = await fetchPendingOpportunityFeedbackActivityItems(args);
  return formatOpportunityFeedbackPromptContext(items);
}

export async function fetchRecentTalentActivitySummaries(args: {
  admin: TalentAdminClient;
  limit?: number;
  userId: string;
}): Promise<TalentActivitySummaryRow[]> {
  const limit = Math.max(1, Math.min(20, Math.floor(args.limit ?? 5)));

  try {
    const { data, error } = (await (
      args.admin.from("talent_activity_events" as any) as any
    )
      .select("created_at, summary")
      .eq("talent_id", args.userId)
      .order("created_at", { ascending: false })
      .limit(limit)) as {
      data: TalentActivitySummaryRow[] | null;
      error: { message?: string } | null;
    };

    if (error) {
      throw new Error(error.message ?? "Failed to load talent_activity_events");
    }

    return Array.isArray(data)
      ? data
          .map((row) => ({
            created_at: row.created_at,
            summary: clampText(row.summary ?? "", 1200),
          }))
          .filter(
            (row) =>
              row.created_at &&
              row.summary &&
              !containsHiddenTalentSettingSummary(row.summary)
          )
      : [];
  } catch (error) {
    console.error("[TalentActivityEvent] Failed to fetch activity summaries", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
    return [];
  }
}
