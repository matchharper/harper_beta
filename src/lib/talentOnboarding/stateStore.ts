import {
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  type TalentNetworkEngagementOptionId,
} from "@/lib/talentNetworkOptions";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import {
  DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
  normalizeTalentRecommendationToggle,
} from "@/lib/talentOnboarding/recommendationSettings";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  TALENT_RESUME_BUCKET,
  TALENT_SETTING_SELECT_QUERY,
  type TalentInsightContent,
  type TalentInsightRow,
  type TalentProfileVisibility,
  type TalentSettingRow,
} from "@/lib/talentOnboarding/models";
import { normalizeCareerPromptLocale } from "@/lib/career/promptLocale";
import { stripPostgresUnsafeChars } from "@/lib/textSanitization";
import { notifyUnsupportedUnicodeEscapeError } from "@/lib/errorAlert";

const TALENT_PROFILE_VISIBILITY_LABELS: Record<
  TalentProfileVisibility,
  string
> = {
  open_to_matches: "Open to matches",
  exceptional_only: "Exceptional only",
  dont_share: "Don't share",
};

const TALENT_ALLOWED_PROFILE_VISIBILITY = new Set<TalentProfileVisibility>([
  "open_to_matches",
  "exceptional_only",
  "dont_share",
]);
const TALENT_ALLOWED_ENGAGEMENT_TYPES =
  new Set<TalentNetworkEngagementOptionId>(
    TALENT_NETWORK_ENGAGEMENT_OPTIONS.map((option) => option.id)
  );
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeTalentInsightText(value: unknown, maxLength = 8000) {
  if (typeof value !== "string") return null;
  const normalized = stripPostgresUnsafeChars(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

export function normalizeTalentBlockedCompanies(companies: unknown): string[] {
  if (!Array.isArray(companies)) return [];

  const unique = new Map<string, string>();
  for (const raw of companies) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    const lower = name.toLowerCase();
    if (unique.has(lower)) continue;
    unique.set(lower, name.slice(0, 120));
  }
  return Array.from(unique.values());
}

export function normalizeTalentEngagementTypes(
  values: unknown
): TalentNetworkEngagementOptionId[] {
  if (!Array.isArray(values)) return [];

  const unique = new Set<TalentNetworkEngagementOptionId>();
  const normalized: TalentNetworkEngagementOptionId[] = [];

  for (const raw of values) {
    const value = String(raw ?? "").trim() as TalentNetworkEngagementOptionId;
    if (!TALENT_ALLOWED_ENGAGEMENT_TYPES.has(value)) continue;
    if (unique.has(value)) continue;
    unique.add(value);
    normalized.push(value);
  }

  return normalized;
}

const TALENT_INSIGHT_KEY_ALIASES: Record<string, string> = {
  collaboration_style: "team_style_fit",
  compensation_expectation: "compensation",
  compensation_floor: "compensation",
  deal_breaker: "deal_breakers",
  desired_role: "next_scope",
  dream_teams: "desired_teams",
  impact_summary: "technical_strengths",
  location_preference: "location",
  must_have: "must_haves",
  next_role: "next_scope",
  preferred_location: "location",
  preferred_role: "next_scope",
  role_preference: "next_scope",
  salary_expectation: "compensation",
  search_urgency: "search_intensity",
  target_role: "next_scope",
  target_roles: "next_scope",
  team_style: "team_style_fit",
};

function normalizeTalentInsightRawKey(value: unknown, maxLength = 64) {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);

  if (!normalized) return null;
  return normalized;
}

export function isTalentInsightKeyAlias(value: unknown, maxLength = 64) {
  const normalized = normalizeTalentInsightRawKey(value, maxLength);
  return Boolean(normalized && TALENT_INSIGHT_KEY_ALIASES[normalized]);
}

export function normalizeTalentInsightKey(value: unknown, maxLength = 64) {
  const normalized = normalizeTalentInsightRawKey(value, maxLength);
  if (!normalized) return null;
  return TALENT_INSIGHT_KEY_ALIASES[normalized] ?? normalized;
}

function shouldReplaceTalentInsightValue(current: string, next: string) {
  if (next.length > current.length) return true;
  if (current.length > next.length) return false;
  return next.localeCompare(current, "ko-KR") > 0;
}

export function normalizeTalentInsightContent(
  value: unknown
): TalentInsightContent | null {
  const record = asRecord(value);
  if (!record) return null;

  const normalized: TalentInsightContent = {};

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const key = normalizeTalentInsightKey(rawKey);
    const nextValue = normalizeTalentInsightText(rawValue, 8000);
    if (!key || !nextValue) continue;
    const currentValue = normalized[key];
    if (
      currentValue &&
      !shouldReplaceTalentInsightValue(currentValue, nextValue)
    ) {
      continue;
    }
    normalized[key] = nextValue;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function mergeTalentInsightContent(args: {
  currentContent: unknown;
  seedContent: TalentInsightContent | null;
}) {
  const current = normalizeTalentInsightContent(args.currentContent);
  const seed = normalizeTalentInsightContent(args.seedContent);

  if (!current && !seed) return null;

  const merged = {
    ...(seed ?? {}),
    ...(current ?? {}),
  } satisfies TalentInsightContent;

  return Object.keys(merged).length > 0 ? merged : null;
}

export function mergeTalentSettingSeed(args: {
  currentSetting: TalentSettingRow | null;
  blockedCompanies?: unknown;
  engagementTypes: unknown;
}) {
  const { currentSetting } = args;
  const currentBlockedCompanies = normalizeTalentBlockedCompanies(
    currentSetting?.blocked_companies ?? []
  );
  const currentEngagementTypes = normalizeTalentEngagementTypes(
    currentSetting?.engagement_types ?? []
  );

  return {
    profileVisibility: sanitizeTalentProfileVisibility(
      currentSetting?.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
    ),
    blockedCompanies:
      currentBlockedCompanies.length > 0
        ? currentBlockedCompanies
        : normalizeTalentBlockedCompanies(args.blockedCompanies ?? []),
    engagementTypes:
      currentEngagementTypes.length > 0
        ? currentEngagementTypes
        : normalizeTalentEngagementTypes(args.engagementTypes),
  };
}

export function sanitizeTalentProfileVisibility(
  value: unknown
): TalentProfileVisibility {
  const normalized = String(value ?? "").trim() as TalentProfileVisibility;
  if (TALENT_ALLOWED_PROFILE_VISIBILITY.has(normalized)) {
    return normalized;
  }
  return DEFAULT_TALENT_PROFILE_VISIBILITY;
}

export function getTalentProfileVisibilityLabel(value: unknown) {
  return TALENT_PROFILE_VISIBILITY_LABELS[
    sanitizeTalentProfileVisibility(value)
  ];
}

export async function fetchTalentSetting(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_setting")
    .select(TALENT_SETTING_SELECT_QUERY)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_setting");
  }

  return (data ?? null) as TalentSettingRow | null;
}

export async function upsertTalentSetting(args: {
  admin: TalentAdminClient;
  userId: string;
  profileVisibility?: TalentProfileVisibility;
  blockedCompanies?: string[];
  engagementTypes?: TalentNetworkEngagementOptionId[];
  getExternalRecommendation?: boolean;
  getInternalRecommendation?: boolean;
  periodicIntervalDays?: number;
  preferredLocale?: string | null;
  recommendationBatchSize?: number;
  recommendationSourceConversationId?: string | null;
}) {
  const { admin, userId } = args;
  const current = await fetchTalentSetting({ admin, userId });
  const now = new Date().toISOString();
  const preferredLocale =
    args.preferredLocale === undefined
      ? current?.preferred_locale
      : normalizeCareerPromptLocale(args.preferredLocale);
  const payload = {
    user_id: userId,
    profile_visibility: sanitizeTalentProfileVisibility(
      args.profileVisibility ??
        current?.profile_visibility ??
        DEFAULT_TALENT_PROFILE_VISIBILITY
    ),
    blocked_companies: normalizeTalentBlockedCompanies(
      args.blockedCompanies ?? current?.blocked_companies ?? []
    ),
    engagement_types: normalizeTalentEngagementTypes(
      args.engagementTypes ?? current?.engagement_types ?? []
    ),
    get_external_recommendation: normalizeTalentRecommendationToggle(
      args.getExternalRecommendation ??
        current?.get_external_recommendation ??
        DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION
    ),
    get_internal_recommendation: normalizeTalentRecommendationToggle(
      args.getInternalRecommendation ??
        current?.get_internal_recommendation ??
        DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION
    ),
    is_onboarding_done: current?.is_onboarding_done ?? false,
    periodic_interval_days: normalizeTalentPeriodicIntervalDays(
      args.periodicIntervalDays ?? current?.periodic_interval_days
    ),
    ...(preferredLocale ? { preferred_locale: preferredLocale } : {}),
    recommendation_batch_size: normalizeTalentRecommendationBatchSize(
      args.recommendationBatchSize ?? current?.recommendation_batch_size
    ),
    recommendation_source_conversation_id:
      args.recommendationSourceConversationId === undefined
        ? (current?.recommendation_source_conversation_id ?? null)
        : args.recommendationSourceConversationId,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("talent_setting")
    .upsert(payload, { onConflict: "user_id" })
    .select(TALENT_SETTING_SELECT_QUERY)
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to save talent_setting");
  }

  return data as TalentSettingRow;
}

export async function setTalentOnboardingDone(args: {
  admin: TalentAdminClient;
  userId: string;
  isOnboardingDone?: boolean;
  recommendationSourceConversationId?: string | null;
}) {
  const {
    admin,
    userId,
    isOnboardingDone = true,
    recommendationSourceConversationId,
  } = args;
  const now = new Date().toISOString();
  const updatePayload = {
    is_onboarding_done: isOnboardingDone,
    updated_at: now,
    recommendation_source_conversation_id:
      recommendationSourceConversationId === undefined
        ? undefined
        : recommendationSourceConversationId,
  };

  const { data: updated, error: updateError } = await admin
    .from("talent_setting")
    .update(updatePayload)
    .eq("user_id", userId)
    .select(TALENT_SETTING_SELECT_QUERY)
    .maybeSingle();

  if (updateError) {
    throw new Error(updateError.message ?? "Failed to update talent_setting");
  }

  if (updated) {
    return updated as TalentSettingRow;
  }

  const { data: inserted, error: insertError } = await admin
    .from("talent_setting")
    .insert({
      user_id: userId,
      profile_visibility: DEFAULT_TALENT_PROFILE_VISIBILITY,
      blocked_companies: [],
      engagement_types: [],
      get_external_recommendation: DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
      get_internal_recommendation: DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION,
      is_onboarding_done: isOnboardingDone,
      periodic_interval_days: DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
      recommendation_batch_size: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
      recommendation_source_conversation_id:
        recommendationSourceConversationId ?? null,
      updated_at: now,
    })
    .select(TALENT_SETTING_SELECT_QUERY)
    .single();

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to save talent_setting");
  }

  return inserted as TalentSettingRow;
}

export async function fetchTalentInsights(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { admin, userId } = args;
  const { data, error } = await admin
    .from("talent_insights")
    .select("id, talent_id, content, created_at, last_updated_at")
    .eq("talent_id", userId)
    .order("id", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load talent_insights");
  }

  const row = (data ?? [])[0] ?? null;
  if (!row) return null;

  return {
    ...(row as TalentInsightRow),
    content: normalizeTalentInsightContent(row.content),
  } as TalentInsightRow;
}

export async function upsertTalentInsights(args: {
  admin: TalentAdminClient;
  userId: string;
  content: TalentInsightContent | null;
}) {
  const { admin, userId, content } = args;
  const normalizedContent = normalizeTalentInsightContent(content);
  const now = new Date().toISOString();
  const payload = {
    talent_id: userId,
    content: normalizedContent,
    last_updated_at: now,
  };
  const selectQuery = "id, talent_id, content, created_at, last_updated_at";

  const { data, error } = await admin
    .from("talent_insights")
    .upsert(payload, { onConflict: "talent_id" })
    .select(selectQuery)
    .single();

  if (!error) {
    return data as TalentInsightRow;
  }

  const errorMessage = error.message ?? "Failed to save talent_insights";
  const canRetryWithoutConflictKey =
    errorMessage.includes("ON CONFLICT") ||
    errorMessage.includes("unique or exclusion constraint");

  if (!canRetryWithoutConflictKey) {
    await notifyUnsupportedUnicodeEscapeError({
      error,
      metadata: {
        insightKeyCount: Object.keys(normalizedContent ?? {}).length,
      },
      route: "talentOnboardingStateStore",
      stage: "talent_insights.upsert",
      userId,
    });
    throw new Error(errorMessage);
  }

  const existing = await fetchTalentInsights({ admin, userId });
  const mutation = existing
    ? admin.from("talent_insights").update(payload).eq("id", existing.id)
    : admin.from("talent_insights").insert(payload);
  const { data: fallbackData, error: fallbackError } = await mutation
    .select(selectQuery)
    .single();

  if (fallbackError) {
    await notifyUnsupportedUnicodeEscapeError({
      error: fallbackError,
      metadata: {
        insightKeyCount: Object.keys(normalizedContent ?? {}).length,
      },
      route: "talentOnboardingStateStore",
      stage: "talent_insights.fallback_save",
      userId,
    });
    throw new Error(fallbackError.message ?? "Failed to save talent_insights");
  }

  return fallbackData as TalentInsightRow;
}

export async function getTalentResumeSignedUrl(args: {
  admin: TalentAdminClient;
  storagePath: string | null | undefined;
  expiresIn?: number;
}) {
  const { admin, storagePath, expiresIn = 3600 } = args;
  if (!storagePath) return null;

  const { data, error } = await admin.storage
    .from(TALENT_RESUME_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) {
    return null;
  }
  return data?.signedUrl ?? null;
}

export type MergedChecklistItem = {
  key: string;
  label: string;
  promptHint: string | null;
  priority: number;
  source: "code";
};

export async function getMergedChecklist(_args?: {
  admin?: TalentAdminClient;
}): Promise<MergedChecklistItem[]> {
  return INSIGHT_CHECKLIST.map((item) => ({
    key: item.key,
    label: item.label,
    promptHint: item.promptHint,
    priority: item.priority,
    source: "code" as const,
  })).sort((left, right) => left.priority - right.priority);
}

export async function getEmptyInsightKeys(
  content: Record<string, string> | null,
  mergedChecklist: MergedChecklistItem[]
): Promise<MergedChecklistItem[]> {
  return mergedChecklist.filter((item) => {
    const value = content?.[item.key];
    return !value || !value.trim();
  });
}
