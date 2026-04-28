import {
  TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS,
  TALENT_NETWORK_ENGAGEMENT_OPTIONS,
  TALENT_NETWORK_LOCATION_OPTIONS,
  type TalentNetworkCareerMoveIntentOptionId,
  type TalentNetworkEngagementOptionId,
  type TalentNetworkLocationOptionId,
} from "@/lib/talentNetworkApplication";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import {
  DEFAULT_TALENT_PERIODIC_ENABLED,
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentPeriodicEnabled,
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
  type TalentRecommendationSettingsUpdateSource,
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
const TALENT_ALLOWED_PREFERRED_LOCATIONS =
  new Set<TalentNetworkLocationOptionId>(
    TALENT_NETWORK_LOCATION_OPTIONS.map((option) => option.id)
  );
const TALENT_ALLOWED_CAREER_MOVE_INTENTS =
  new Set<TalentNetworkCareerMoveIntentOptionId>(
    TALENT_NETWORK_CAREER_MOVE_INTENT_OPTIONS.map((option) => option.id)
  );

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeTalentInsightText(value: unknown, maxLength = 8000) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
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

export function normalizeTalentPreferredLocations(
  values: unknown
): TalentNetworkLocationOptionId[] {
  if (!Array.isArray(values)) return [];

  const unique = new Set<TalentNetworkLocationOptionId>();
  const normalized: TalentNetworkLocationOptionId[] = [];

  for (const raw of values) {
    const value = String(raw ?? "").trim() as TalentNetworkLocationOptionId;
    if (!TALENT_ALLOWED_PREFERRED_LOCATIONS.has(value)) continue;
    if (unique.has(value)) continue;
    unique.add(value);
    normalized.push(value);
  }

  return normalized;
}

export function sanitizeTalentCareerMoveIntent(
  value: unknown
): TalentNetworkCareerMoveIntentOptionId | null {
  const normalized = String(
    value ?? ""
  ).trim() as TalentNetworkCareerMoveIntentOptionId;
  if (TALENT_ALLOWED_CAREER_MOVE_INTENTS.has(normalized)) {
    return normalized;
  }
  return null;
}

export function normalizeTalentInsightKey(value: unknown, maxLength = 64) {
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

  if (normalized === "impact_summary") return "technical_strengths";
  if (normalized === "dream_teams") return "desired_teams";

  return normalized;
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
  preferredLocations: unknown;
  careerMoveIntent: unknown;
}) {
  const { currentSetting } = args;
  const currentBlockedCompanies = normalizeTalentBlockedCompanies(
    currentSetting?.blocked_companies ?? []
  );
  const currentEngagementTypes = normalizeTalentEngagementTypes(
    currentSetting?.engagement_types ?? []
  );
  const currentPreferredLocations = normalizeTalentPreferredLocations(
    currentSetting?.preferred_locations ?? []
  );
  const currentCareerMoveIntent = sanitizeTalentCareerMoveIntent(
    currentSetting?.career_move_intent
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
    preferredLocations:
      currentPreferredLocations.length > 0
        ? currentPreferredLocations
        : normalizeTalentPreferredLocations(args.preferredLocations),
    careerMoveIntent:
      currentCareerMoveIntent ??
      sanitizeTalentCareerMoveIntent(args.careerMoveIntent),
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
  return TALENT_PROFILE_VISIBILITY_LABELS[sanitizeTalentProfileVisibility(value)];
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
  preferredLocations?: TalentNetworkLocationOptionId[];
  careerMoveIntent?: TalentNetworkCareerMoveIntentOptionId | null;
  periodicEnabled?: boolean;
  periodicIntervalDays?: number;
  recommendationBatchSize?: number;
  lastPeriodicRunAt?: string | null;
  recommendationSourceConversationId?: string | null;
  recommendationSettingsUpdatedBy?: TalentRecommendationSettingsUpdateSource;
}) {
  const { admin, userId } = args;
  const current = await fetchTalentSetting({ admin, userId });
  const now = new Date().toISOString();
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
    preferred_locations: normalizeTalentPreferredLocations(
      args.preferredLocations ?? current?.preferred_locations ?? []
    ),
    career_move_intent: sanitizeTalentCareerMoveIntent(
      args.careerMoveIntent ?? current?.career_move_intent
    ),
    is_onboarding_done: current?.is_onboarding_done ?? false,
    periodic_enabled: normalizeTalentPeriodicEnabled(
      args.periodicEnabled ??
        current?.periodic_enabled ??
        DEFAULT_TALENT_PERIODIC_ENABLED
    ),
    periodic_interval_days: normalizeTalentPeriodicIntervalDays(
      args.periodicIntervalDays ?? current?.periodic_interval_days
    ),
    recommendation_batch_size: normalizeTalentRecommendationBatchSize(
      args.recommendationBatchSize ?? current?.recommendation_batch_size
    ),
    last_periodic_run_at:
      args.lastPeriodicRunAt === undefined
        ? current?.last_periodic_run_at ?? null
        : args.lastPeriodicRunAt,
    recommendation_source_conversation_id:
      args.recommendationSourceConversationId === undefined
        ? current?.recommendation_source_conversation_id ?? null
        : args.recommendationSourceConversationId,
    recommendation_settings_updated_by:
      args.recommendationSettingsUpdatedBy ??
      current?.recommendation_settings_updated_by ??
      "user_settings",
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
  recommendationSettingsUpdatedBy?: TalentRecommendationSettingsUpdateSource;
  recommendationSourceConversationId?: string | null;
}) {
  const {
    admin,
    userId,
    isOnboardingDone = true,
    recommendationSettingsUpdatedBy,
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
    recommendation_settings_updated_by:
      recommendationSettingsUpdatedBy ?? undefined,
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
      preferred_locations: [],
      career_move_intent: null,
      is_onboarding_done: isOnboardingDone,
      periodic_enabled: DEFAULT_TALENT_PERIODIC_ENABLED,
      periodic_interval_days: DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
      recommendation_batch_size: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
      recommendation_source_conversation_id:
        recommendationSourceConversationId ?? null,
      recommendation_settings_updated_by:
        recommendationSettingsUpdatedBy ?? "user_settings",
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
  return (row ?? null) as TalentInsightRow | null;
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

export async function fetchCustomChecklistItems(args: {
  admin: TalentAdminClient;
}) {
  const { admin } = args;
  const { data, error } = await admin
    .from("insight_checklist_items")
    .select(
      "id, key, label, prompt_hint, priority, is_active, created_at, created_by"
    )
    .eq("is_active", true)
    .order("priority", { ascending: true });

  if (error) throw new Error(error.message ?? "Failed to load checklist items");
  return data ?? [];
}

export async function addCustomChecklistItem(args: {
  admin: TalentAdminClient;
  key: string;
  label: string;
  promptHint?: string;
  createdBy?: string;
}) {
  const { admin, label, promptHint, createdBy } = args;
  const key = normalizeTalentInsightKey(args.key);
  if (!key) throw new Error("Invalid key");

  const { data, error } = await admin
    .from("insight_checklist_items")
    .insert({
      key,
      label,
      prompt_hint: promptHint ?? null,
      is_active: true,
      created_by: createdBy ?? null,
    })
    .select(
      "id, key, label, prompt_hint, priority, is_active, created_at, created_by"
    )
    .single();

  if (error)
    throw new Error(error.message ?? "Failed to insert checklist item");
  return data;
}

export async function deleteCustomChecklistItem(args: {
  admin: TalentAdminClient;
  key: string;
}) {
  const { admin, key } = args;
  const { error } = await admin
    .from("insight_checklist_items")
    .update({ is_active: false })
    .eq("key", key);

  if (error)
    throw new Error(error.message ?? "Failed to delete checklist item");
}

export type MergedChecklistItem = {
  key: string;
  label: string;
  promptHint: string | null;
  priority: number;
  source: "code" | "db";
};

export async function getMergedChecklist(args: {
  admin: TalentAdminClient;
}): Promise<MergedChecklistItem[]> {
  let dbItems: Awaited<ReturnType<typeof fetchCustomChecklistItems>> = [];
  try {
    dbItems = await fetchCustomChecklistItems(args);
  } catch {
    // Table may not exist yet.
  }

  const codeItems: MergedChecklistItem[] = INSIGHT_CHECKLIST.map((item) => ({
    key: item.key,
    label: item.label,
    promptHint: item.promptHint,
    priority: item.priority,
    source: "code" as const,
  }));

  const dbMapped: MergedChecklistItem[] = dbItems.map((item) => ({
    key: item.key,
    label: item.label,
    promptHint: item.prompt_hint,
    priority: item.priority ?? 50,
    source: "db" as const,
  }));

  const codeKeySet = new Set(codeItems.map((item) => item.key));
  const deduped = [
    ...codeItems,
    ...dbMapped.filter((item) => !codeKeySet.has(item.key)),
  ];

  return deduped.sort((left, right) => left.priority - right.priority);
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
