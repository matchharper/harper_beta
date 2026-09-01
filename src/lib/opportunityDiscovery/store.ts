import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT,
  type OpportunityDiscoveryTrigger,
  type OpportunityDiscoveryAgentVariant,
  type OpportunityRunMode,
  type OpportunityRunRow,
  type OpportunityRunSourceKind,
  type RecommendationSettings,
  type SerializedOpportunityRun,
} from "./types";
import {
  DEFAULT_TALENT_PROFILE_VISIBILITY,
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  sanitizeTalentProfileVisibility,
  setTalentOnboardingDone,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import { insertTalentActivityEvent } from "@/lib/talentOnboarding/activityEvents";
import type { TalentOnboardingCompletionReason } from "@/lib/talentOnboarding/completion";
import {
  extractOpportunityRunMarkers,
  type OpportunityRunMarkerRelation,
} from "./messageMarker";
import { completeActiveCareerOnboardingCall } from "@/lib/talentOnboarding/calls";
import { cancelCareerOnboardingContactQueue } from "@/lib/contactQueue";
import {
  DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentRecommendationBatchSize,
  normalizeTalentRecommendationToggle,
} from "@/lib/talentOnboarding/recommendationSettings";

if (typeof window !== "undefined") {
  throw new Error("opportunityDiscovery store must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

const DEFAULT_SETTINGS: RecommendationSettings = {
  getExternalRecommendation: DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION,
  profileVisibility: DEFAULT_TALENT_PROFILE_VISIBILITY,
  recommendationBatchSize: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
};

const OPPORTUNITY_RUN_LOCK_TIMEOUT_MS = 3 * 60 * 1000;
const INITIAL_ONBOARDING_RECOMMENDATION_COUNT = 15;
const CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT =
  "career_chat_external_search_v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getRecord = (value: unknown) => (isRecord(value) ? value : null);

const getSafeString = (value: unknown, maxLength = 160) => {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const getNonNegativeCount = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
};

const getPositiveCount = (value: unknown) => {
  const count = getNonNegativeCount(value);
  return count !== null && count > 0 ? count : null;
};

export function isCareerChatExternalSearchRun(run: OpportunityRunRow) {
  return (
    getSafeString(getRecord(run.trigger_payload)?.runContract, 80) ===
    CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT
  );
}

function getOpportunityRunSourceKind(
  run: OpportunityRunRow
): OpportunityRunSourceKind {
  if (isCareerChatExternalSearchRun(run)) return "on_demand";
  if (run.trigger === "conversation_completed") return "initial";
  if (run.trigger === "all_batch_feedback_submitted") return "feedback";
  if (run.trigger === "periodic_refresh_due") return "periodic";
  return "other";
}

function getSafeOpportunityRunCoverage(value: unknown) {
  const coverage = getRecord(value) ?? {};
  const delivery = getRecord(coverage.delivery);
  const candidateCounts = getRecord(coverage.candidateCounts);
  const safeCandidateCounts = candidateCounts
    ? {
        ...(getNonNegativeCount(candidateCounts.externalRaw) !== null
          ? { externalRaw: getNonNegativeCount(candidateCounts.externalRaw) }
          : {}),
        ...(getNonNegativeCount(
          candidateCounts.externalAfterAlreadyRecommendedFilter
        ) !== null
          ? {
              externalAfterAlreadyRecommendedFilter: getNonNegativeCount(
                candidateCounts.externalAfterAlreadyRecommendedFilter
              ),
            }
          : {}),
        ...(getNonNegativeCount(candidateCounts.externalAfterLivenessFilter) !==
        null
          ? {
              externalAfterLivenessFilter: getNonNegativeCount(
                candidateCounts.externalAfterLivenessFilter
              ),
            }
          : {}),
        ...(getNonNegativeCount(candidateCounts.shortlistedExternal) !== null
          ? {
              shortlistedExternal: getNonNegativeCount(
                candidateCounts.shortlistedExternal
              ),
            }
          : {}),
        ...(getNonNegativeCount(candidateCounts.detailedExternal) !== null
          ? {
              detailedExternal: getNonNegativeCount(
                candidateCounts.detailedExternal
              ),
            }
          : {}),
        ...(getNonNegativeCount(candidateCounts.targetExternalCount) !== null
          ? {
              targetExternalCount: getNonNegativeCount(
                candidateCounts.targetExternalCount
              ),
            }
          : {}),
      }
    : null;

  return {
    ...(getSafeString(coverage.phase, 80)
      ? { phase: getSafeString(coverage.phase, 80) }
      : {}),
    ...(getSafeString(coverage.completionKind, 80)
      ? { completionKind: getSafeString(coverage.completionKind, 80) }
      : {}),
    ...(getSafeString(coverage.terminationReason, 80)
      ? { terminationReason: getSafeString(coverage.terminationReason, 80) }
      : {}),
    ...(getSafeString(coverage.failureKind, 80)
      ? { failureKind: getSafeString(coverage.failureKind, 80) }
      : {}),
    ...(getNonNegativeCount(coverage.requestedMaxResults) !== null
      ? {
          requestedMaxResults: getNonNegativeCount(
            coverage.requestedMaxResults
          ),
        }
      : {}),
    ...(getNonNegativeCount(coverage.candidateCount) !== null
      ? { candidateCount: getNonNegativeCount(coverage.candidateCount) }
      : {}),
    ...(getNonNegativeCount(coverage.liveCandidateCount) !== null
      ? { liveCandidateCount: getNonNegativeCount(coverage.liveCandidateCount) }
      : {}),
    ...(getNonNegativeCount(coverage.scoredCandidateCount) !== null
      ? {
          scoredCandidateCount: getNonNegativeCount(
            coverage.scoredCandidateCount
          ),
        }
      : {}),
    ...(getNonNegativeCount(coverage.selectedCount) !== null
      ? { selectedCount: getNonNegativeCount(coverage.selectedCount) }
      : {}),
    ...(getNonNegativeCount(coverage.recommendationCount) !== null
      ? {
          recommendationCount: getNonNegativeCount(
            coverage.recommendationCount
          ),
        }
      : {}),
    ...(safeCandidateCounts && Object.keys(safeCandidateCounts).length > 0
      ? { candidateCounts: safeCandidateCounts }
      : {}),
    ...(typeof coverage.searchTerminal === "boolean"
      ? { searchTerminal: coverage.searchTerminal }
      : {}),
    ...(typeof coverage.deliveryRetryPending === "boolean"
      ? { deliveryRetryPending: coverage.deliveryRetryPending }
      : {}),
    ...(getSafeString(coverage.deliveryRetryDeadline, 64)
      ? {
          deliveryRetryDeadline: getSafeString(
            coverage.deliveryRetryDeadline,
            64
          ),
        }
      : {}),
    ...(getSafeString(coverage.deliveryRecoveredAt, 64)
      ? {
          deliveryRecoveredAt: getSafeString(coverage.deliveryRecoveredAt, 64),
        }
      : {}),
    ...(delivery
      ? {
          delivery: {
            ...(getSafeString(delivery.chat, 40)
              ? { chat: getSafeString(delivery.chat, 40) }
              : {}),
            ...(getSafeString(delivery.email, 40)
              ? { email: getSafeString(delivery.email, 40) }
              : {}),
          },
        }
      : {}),
  } satisfies Record<string, unknown>;
}

function normalizeOpportunityAgentVariant(
  value: unknown
): OpportunityDiscoveryAgentVariant | null {
  return value === "tool_agent" ||
    value === "new_rule" ||
    value === "new_v2" ||
    value === "new_harper_agent_v2" ||
    value === "scripted" ||
    value === "scripted_human"
    ? value
    : null;
}

function readOpportunityAgentVariant(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  return normalizeOpportunityAgentVariant(
    (payload as Record<string, unknown>).opportunityAgentVariant
  );
}

function isOpportunityRunLockExpired(run: OpportunityRunRow) {
  if (run.status !== "queued" && run.status !== "running") return false;
  const anchor = run.started_at ?? run.created_at;
  const time = Date.parse(anchor);
  if (Number.isNaN(time)) return false;
  return Date.now() - time > OPPORTUNITY_RUN_LOCK_TIMEOUT_MS;
}

function isUniqueViolation(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "23505"
  );
}

export type CreateDiscoveryRunArgs = {
  conversationId?: string | null;
  initialStatus?: "queued" | "running";
  runMode?: OpportunityRunMode;
  talentId: string;
  targetRecommendationCount?: number;
  trigger: OpportunityDiscoveryTrigger;
  triggerPayload?: Record<string, unknown>;
};

export function getOpportunityAdmin() {
  return getTalentSupabaseAdmin();
}

export async function fetchRecommendationSettings(args: {
  admin: AdminClient;
  userId: string;
}): Promise<RecommendationSettings> {
  const data = await fetchTalentSetting({
    admin: args.admin,
    userId: args.userId,
  });
  if (!data) return DEFAULT_SETTINGS;

  return {
    getExternalRecommendation: normalizeTalentRecommendationToggle(
      data.get_external_recommendation
    ),
    profileVisibility: sanitizeTalentProfileVisibility(
      data.profile_visibility ?? DEFAULT_TALENT_PROFILE_VISIBILITY
    ),
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      data.recommendation_batch_size
    ),
  };
}

export async function upsertRecommendationSettings(args: {
  admin: AdminClient;
  recommendationBatchSize?: number;
  userId: string;
}) {
  const saved = await upsertTalentSetting({
    admin: args.admin,
    userId: args.userId,
    recommendationBatchSize: args.recommendationBatchSize,
  });

  return {
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      saved.recommendation_batch_size
    ),
  };
}

export async function getActiveOpportunityRun(args: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) throw new Error(error.message ?? "Failed to load active run");
  const run = (data ?? null) as OpportunityRunRow | null;
  if (run && isOpportunityRunLockExpired(run)) return null;
  return run;
}

async function fetchActiveOpportunityRunForTalent(args: {
  admin: AdminClient;
  includeExpired?: boolean;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) throw new Error(error.message ?? "Failed to load active run");
  const run = (data ?? null) as OpportunityRunRow | null;
  if (!args.includeExpired && run && isOpportunityRunLockExpired(run)) {
    return null;
  }
  return run;
}

export async function fetchLatestOpportunityRun(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as any);

  if (error) throw new Error(error.message ?? "Failed to load latest run");
  return (data ?? null) as OpportunityRunRow | null;
}

export async function hasInitialOpportunityDiscoveryRun(args: {
  admin: AdminClient;
  userId: string;
}) {
  const { count, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("id", { count: "exact", head: true })
    .eq("talent_id", args.userId)
    .eq("run_mode", "initial") as any);

  if (error) {
    throw new Error(
      error.message ?? "Failed to check initial opportunity discovery run"
    );
  }

  return Number(count ?? 0) > 0;
}

export async function completeOnboardingAndQueueInitialOpportunityRun(args: {
  admin: AdminClient;
  completionReason: TalentOnboardingCompletionReason;
  conversationId: string;
  source: string;
  userId: string;
}) {
  await setTalentOnboardingDone({
    admin: args.admin,
    userId: args.userId,
    isOnboardingDone: true,
  });
  await cancelCareerOnboardingContactQueue({
    admin: args.admin,
    userId: args.userId,
  }).catch((error) => {
    console.error("[opportunity-discovery] Failed to cancel contact queue", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  });
  await completeActiveCareerOnboardingCall({
    admin: args.admin,
    userId: args.userId,
  }).catch((error) => {
    console.error("[opportunity-discovery] Failed to complete talent call", {
      error: error instanceof Error ? error.message : String(error),
      userId: args.userId,
    });
  });

  const hasInitialRun = await hasInitialOpportunityDiscoveryRun({
    admin: args.admin,
    userId: args.userId,
  });
  if (hasInitialRun) {
    await insertTalentActivityEvent({
      admin: args.admin,
      changedDomains: ["onboarding", "opportunity_search"],
      conversationId: args.conversationId,
      eventType: "onboarding_completed",
      impactLevel: "high",
      source: "onboarding",
      summary:
        "Onboarding completed; initial opportunity search was not queued because an initial run already exists.",
      userId: args.userId,
    });
    return null;
  }

  const run = await createOpportunityDiscoveryRun({
    admin: args.admin,
    conversationId: args.conversationId,
    runMode: "initial",
    talentId: args.userId,
    targetRecommendationCount: INITIAL_ONBOARDING_RECOMMENDATION_COUNT,
    trigger: "conversation_completed",
    triggerPayload: {
      completionReason: args.completionReason,
      entryPoint: "first_onboarding_batch",
      source: args.source,
    },
  });

  await insertTalentActivityEvent({
    admin: args.admin,
    changedDomains: ["onboarding", "opportunity_search"],
    conversationId: args.conversationId,
    eventType: "onboarding_completed",
    impactLevel: "high",
    source: "onboarding",
    summary: `Onboarding completed; initial opportunity search ${run.id} was queued.`,
    userId: args.userId,
  });

  return run;
}

export function serializeOpportunityRun(
  run: OpportunityRunRow | null
): SerializedOpportunityRun | null {
  if (!run) return null;
  const active = run.status === "queued" || run.status === "running";
  const triggerPayload = getRecord(run.trigger_payload) ?? {};
  const request = getRecord(triggerPayload.request);
  const safeCoverage = getSafeOpportunityRunCoverage(run.coverage);
  const safeCandidateCounts = getRecord(safeCoverage.candidateCounts);
  const isOnDemand = isCareerChatExternalSearchRun(run);
  const locksConversationInput =
    typeof triggerPayload.locksConversationInput === "boolean"
      ? triggerPayload.locksConversationInput
      : true;
  const inputLocked = isOnDemand
    ? active && locksConversationInput
    : active && locksConversationInput && !isOpportunityRunLockExpired(run);
  const candidateCount =
    getNonNegativeCount(safeCoverage.candidateCount) ??
    getNonNegativeCount(safeCoverage.liveCandidateCount) ??
    getNonNegativeCount(safeCandidateCounts?.externalAfterLivenessFilter) ??
    getNonNegativeCount(
      safeCandidateCounts?.externalAfterAlreadyRecommendedFilter
    ) ??
    getNonNegativeCount(safeCandidateCounts?.externalRaw);
  const recommendationCount =
    getNonNegativeCount(safeCoverage.recommendationCount) ??
    getNonNegativeCount(safeCoverage.selectedCount) ??
    getNonNegativeCount(safeCandidateCounts?.detailedExternal) ??
    getNonNegativeCount(safeCandidateCounts?.shortlistedExternal);
  const requestedMaxResults =
    getPositiveCount(request?.maxResults) ??
    getPositiveCount(run.target_recommendation_count) ??
    getPositiveCount(safeCoverage.requestedMaxResults);
  const purposeText =
    getSafeString(request?.purposeText) ?? getSafeString(request?.text);
  const failureKind = getSafeString(safeCoverage.failureKind, 80);
  const completionKind = getSafeString(safeCoverage.completionKind, 80);
  const deliveryRetryPending = safeCoverage.deliveryRetryPending === true;
  const searchTerminal =
    safeCoverage.searchTerminal === true ||
    run.status === "completed" ||
    run.status === "partial" ||
    run.status === "failed";

  return {
    active,
    agentVariant: readOpportunityAgentVariant(run.trigger_payload),
    candidateCount,
    completedAt: run.completed_at ?? null,
    completionKind,
    coverage: safeCoverage,
    createdAt: run.created_at,
    deliveryRetryPending,
    failureKind,
    id: run.id,
    inputLocked,
    purposeText,
    recommendationCount,
    requestedMaxResults,
    searchTerminal,
    sourceKind: getOpportunityRunSourceKind(run),
    startedAt: run.started_at ?? null,
    status: run.status,
    trigger: run.trigger,
    updatedAt: run.updated_at ?? run.created_at,
  };
}

export async function fetchOpportunityRunsByIds(args: {
  admin: AdminClient;
  runIds: string[];
  userId: string;
}) {
  if (args.runIds.length === 0) return [];

  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .in("id", args.runIds) as any);

  if (error) throw new Error(error.message ?? "Failed to load runs");
  return (Array.isArray(data) ? data : []) as OpportunityRunRow[];
}

export async function fetchSerializedOpportunityRunForTalent(args: {
  admin: AdminClient;
  runId: string;
  userId: string;
}) {
  const [run] = await fetchOpportunityRunsByIds({
    admin: args.admin,
    runIds: [args.runId],
    userId: args.userId,
  });
  return serializeOpportunityRun(run ?? null);
}

export async function fetchActiveOpportunityRunsForConversation(args: {
  admin: AdminClient;
  conversationId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("talent_id", args.userId)
    .eq("conversation_id", args.conversationId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false }) as any);

  if (error) {
    throw new Error(error.message ?? "Failed to load active conversation runs");
  }
  return (Array.isArray(data) ? data : []) as OpportunityRunRow[];
}

export async function hydrateOpportunityRunsForMessages<
  TMessage extends {
    content: string | null | undefined;
    role: string | null | undefined;
  },
>(args: {
  admin: AdminClient;
  messages: TMessage[];
  userId: string;
}): Promise<
  Array<
    TMessage & {
      recommendationSearchRelation?: OpportunityRunMarkerRelation;
      recommendationSearchRun?: SerializedOpportunityRun;
    }
  >
> {
  const markerByMessage = new Map<
    TMessage,
    ReturnType<typeof extractOpportunityRunMarkers>[number]
  >();
  const runIds = new Set<string>();

  for (const message of args.messages) {
    if (message.role !== "assistant") continue;
    const marker = extractOpportunityRunMarkers(
      String(message.content ?? "")
    ).at(-1);
    if (!marker) continue;
    markerByMessage.set(message, marker);
    runIds.add(marker.runId);
  }

  const rows = await fetchOpportunityRunsByIds({
    admin: args.admin,
    runIds: Array.from(runIds),
    userId: args.userId,
  });
  const serializedRunById = new Map(
    rows
      .map((row) => serializeOpportunityRun(row))
      .filter((run): run is SerializedOpportunityRun => run !== null)
      .map((run) => [run.id.toLowerCase(), run])
  );

  return args.messages.map((message) => {
    const marker = markerByMessage.get(message);
    if (!marker) return message;
    const run = serializedRunById.get(marker.runId.toLowerCase());
    if (!run) return message;
    return {
      ...message,
      recommendationSearchRelation: marker.relation,
      recommendationSearchRun: run,
    };
  });
}

export async function createOpportunityDiscoveryRun(
  args: {
    admin: AdminClient;
  } & CreateDiscoveryRunArgs
) {
  const settings = await fetchRecommendationSettings({
    admin: args.admin,
    userId: args.talentId,
  });

  const requestedAgentVariant = readOpportunityAgentVariant(
    args.triggerPayload
  );
  const triggerPayload = {
    ...(args.triggerPayload ?? {}),
    opportunityAgentVariant:
      requestedAgentVariant ?? DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT,
  };
  const recommendationBatchSizeForRun =
    args.targetRecommendationCount ?? settings.recommendationBatchSize;

  const payload = {
    conversation_id: args.conversationId ?? null,
    run_mode: args.runMode ?? triggerToRunMode(args.trigger),
    settings_snapshot: {
      getExternalRecommendation: settings.getExternalRecommendation,
      profileVisibility: settings.profileVisibility,
      recommendationBatchSize: recommendationBatchSizeForRun,
    },
    status: args.initialStatus ?? "queued",
    ...(args.initialStatus === "running"
      ? { started_at: new Date().toISOString() }
      : {}),
    talent_id: args.talentId,
    ...(args.targetRecommendationCount !== undefined
      ? { target_recommendation_count: args.targetRecommendationCount }
      : {}),
    trigger: args.trigger,
    trigger_payload: triggerPayload,
  };

  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .insert(payload)
    .select("*")
    .single() as any);

  if (error) {
    if (isUniqueViolation(error)) {
      const activeRun = await fetchActiveOpportunityRunForTalent({
        admin: args.admin,
        includeExpired: true,
        userId: args.talentId,
      });
      if (activeRun) return activeRun;
    }
    throw new Error(error.message ?? "Failed to create run");
  }
  return data as OpportunityRunRow;
}

export async function fetchOpportunityRun(args: {
  admin: AdminClient;
  runId: string;
  userId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("id", args.runId)
    .eq("talent_id", args.userId)
    .maybeSingle() as any);

  if (error) throw new Error(error.message ?? "Failed to load run");
  return (data ?? null) as OpportunityRunRow | null;
}

export async function updateOpportunityRun(args: {
  admin: AdminClient;
  coverage?: Record<string, unknown>;
  errorMessage?: string | null;
  queryPlan?: Record<string, unknown>;
  runId: string;
  status: "running" | "completed" | "failed" | "partial";
}) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: args.status,
  };

  if (args.status === "running") payload.started_at = now;
  if (
    args.status === "completed" ||
    args.status === "failed" ||
    args.status === "partial"
  ) {
    payload.completed_at = now;
  }
  if (args.coverage) payload.coverage = args.coverage;
  if (args.errorMessage !== undefined)
    payload.error_message = args.errorMessage;
  if (args.queryPlan) payload.query_plan = args.queryPlan;

  const { error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .update(payload)
    .eq("id", args.runId) as any);

  if (error) throw new Error(error.message ?? "Failed to update run");
}

export function triggerToRunMode(
  trigger: OpportunityDiscoveryTrigger
): OpportunityRunMode {
  if (trigger === "immediate_opportunity_requested") return "immediate";
  if (trigger === "all_batch_feedback_submitted") return "refine";
  if (trigger === "periodic_refresh_due") return "refresh";
  return "initial";
}

export function canUserManageManualIngestion(user: User | null) {
  const email = String(user?.email ?? "")
    .trim()
    .toLowerCase();
  return email.endsWith("@matchharper.com") || email === "khj605123@gmail.com";
}
