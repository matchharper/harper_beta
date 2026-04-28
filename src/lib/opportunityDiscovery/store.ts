import type { User } from "@supabase/supabase-js";
import type {
  OpportunityDiscoveryTrigger,
  OpportunityIngestionRunRow,
  OpportunityIngestionTrigger,
  OpportunityRunMode,
  OpportunityRunRow,
  RecommendationSettings,
} from "./types";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
  setTalentOnboardingDone,
  upsertTalentSetting,
} from "@/lib/talentOnboarding/server";
import type { TalentOnboardingCompletionReason } from "@/lib/talentOnboarding/completion";
import {
  DEFAULT_TALENT_PERIODIC_ENABLED,
  DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
  normalizeTalentPeriodicEnabled,
  normalizeTalentPeriodicIntervalDays,
  normalizeTalentRecommendationBatchSize,
} from "@/lib/talentOnboarding/recommendationSettings";

if (typeof window !== "undefined") {
  throw new Error("opportunityDiscovery store must not run in the browser");
}

type AdminClient = ReturnType<typeof getTalentSupabaseAdmin>;

const DEFAULT_SETTINGS: RecommendationSettings = {
  periodicEnabled: DEFAULT_TALENT_PERIODIC_ENABLED,
  periodicIntervalDays: DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS,
  recommendationBatchSize: DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE,
};

const OPPORTUNITY_RUN_LOCK_TIMEOUT_MS = 3 * 60 * 1000;

function isOpportunityRunLockExpired(run: OpportunityRunRow) {
  if (run.status !== "queued" && run.status !== "running") return false;
  const anchor = run.started_at ?? run.created_at;
  const time = Date.parse(anchor);
  if (Number.isNaN(time)) return false;
  return Date.now() - time > OPPORTUNITY_RUN_LOCK_TIMEOUT_MS;
}

export type CreateDiscoveryRunArgs = {
  chatPreviewCount?: number;
  conversationId?: string | null;
  runMode?: OpportunityRunMode;
  targetRecommendationCount?: number;
  talentId: string;
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
    periodicEnabled: normalizeTalentPeriodicEnabled(data.periodic_enabled),
    periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
      data.periodic_interval_days
    ),
    recommendationBatchSize: normalizeTalentRecommendationBatchSize(
      data.recommendation_batch_size
    ),
  };
}

export async function upsertRecommendationSettings(args: {
  admin: AdminClient;
  periodicEnabled?: boolean;
  periodicIntervalDays?: number;
  recommendationBatchSize?: number;
  sourceConversationId?: string | null;
  updatedBy: "user_settings" | "conversation" | "admin";
  userId: string;
}) {
  const saved = await upsertTalentSetting({
    admin: args.admin,
    userId: args.userId,
    periodicEnabled: args.periodicEnabled,
    periodicIntervalDays: args.periodicIntervalDays,
    recommendationBatchSize: args.recommendationBatchSize,
    recommendationSourceConversationId: args.sourceConversationId,
    recommendationSettingsUpdatedBy: args.updatedBy,
  });

  return {
    periodicEnabled: normalizeTalentPeriodicEnabled(saved.periodic_enabled),
    periodicIntervalDays: normalizeTalentPeriodicIntervalDays(
      saved.periodic_interval_days
    ),
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
  targetRecommendationCount?: number;
  userId: string;
}) {
  await setTalentOnboardingDone({
    admin: args.admin,
    userId: args.userId,
    isOnboardingDone: true,
    recommendationSourceConversationId: args.conversationId,
    recommendationSettingsUpdatedBy: "conversation",
  });

  const hasInitialRun = await hasInitialOpportunityDiscoveryRun({
    admin: args.admin,
    userId: args.userId,
  });
  if (hasInitialRun) return null;

  return createOpportunityDiscoveryRun({
    admin: args.admin,
    chatPreviewCount: 3,
    conversationId: args.conversationId,
    runMode: "initial",
    talentId: args.userId,
    targetRecommendationCount: args.targetRecommendationCount ?? 80,
    trigger: "conversation_completed",
    triggerPayload: {
      completionReason: args.completionReason,
      entryPoint: "first_onboarding_batch",
      source: args.source,
    },
  });
}

export function serializeOpportunityRun(run: OpportunityRunRow | null) {
  if (!run) return null;
  const inputLocked =
    (run.status === "queued" || run.status === "running") &&
    !isOpportunityRunLockExpired(run);

  return {
    chatPreviewCount: run.chat_preview_count,
    completedAt: run.completed_at ?? null,
    coverage: run.coverage ?? {},
    createdAt: run.created_at,
    errorMessage: run.error_message ?? null,
    id: run.id,
    inputLocked,
    startedAt: run.started_at ?? null,
    status: run.status,
    targetRecommendationCount: run.target_recommendation_count,
    trigger: run.trigger,
  };
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

  const payload = {
    chat_preview_count: Math.max(0, Math.min(10, args.chatPreviewCount ?? 3)),
    conversation_id: args.conversationId ?? null,
    run_mode: args.runMode ?? triggerToRunMode(args.trigger),
    settings_snapshot: {
      periodicEnabled: settings.periodicEnabled,
      periodicIntervalDays: settings.periodicIntervalDays,
      recommendationBatchSize: settings.recommendationBatchSize,
    },
    status: "queued",
    talent_id: args.talentId,
    target_recommendation_count: Math.max(
      1,
      Math.min(
        200,
        Math.floor(
          args.targetRecommendationCount ?? settings.recommendationBatchSize
        )
      )
    ),
    trigger: args.trigger,
    trigger_payload: args.triggerPayload ?? {},
  };

  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .insert(payload)
    .select("*")
    .single() as any);

  if (error) throw new Error(error.message ?? "Failed to create run");
  return data as OpportunityRunRow;
}

export async function fetchOpportunityRun(args: {
  admin: AdminClient;
  runId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .select("*")
    .eq("id", args.runId)
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
  userBrief?: Record<string, unknown>;
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
  if (args.userBrief) payload.user_brief = args.userBrief;

  const { error } = await ((
    args.admin.from("opportunity_discovery_run" as any) as any
  )
    .update(payload)
    .eq("id", args.runId) as any);

  if (error) throw new Error(error.message ?? "Failed to update run");
}

export async function createOpportunityIngestionRun(args: {
  admin: AdminClient;
  limit?: number;
  sourceScope?: Record<string, unknown>;
  trigger: OpportunityIngestionTrigger;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_ingestion_run" as any) as any
  )
    .insert({
      source_scope: {
        limit: args.limit ?? null,
        ...(args.sourceScope ?? {}),
      },
      status: "queued",
      trigger: args.trigger,
    })
    .select("*")
    .single() as any);

  if (error) throw new Error(error.message ?? "Failed to create ingestion run");
  return data as OpportunityIngestionRunRow;
}

export async function fetchIngestionRun(args: {
  admin: AdminClient;
  runId: string;
}) {
  const { data, error } = await ((
    args.admin.from("opportunity_ingestion_run" as any) as any
  )
    .select("*")
    .eq("id", args.runId)
    .maybeSingle() as any);

  if (error) throw new Error(error.message ?? "Failed to load ingestion run");
  return (data ?? null) as OpportunityIngestionRunRow | null;
}

export async function updateIngestionRun(args: {
  admin: AdminClient;
  coverage?: Record<string, unknown>;
  errorMessage?: string | null;
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

  const { error } = await ((
    args.admin.from("opportunity_ingestion_run" as any) as any
  )
    .update(payload)
    .eq("id", args.runId) as any);

  if (error) throw new Error(error.message ?? "Failed to update ingestion run");
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
