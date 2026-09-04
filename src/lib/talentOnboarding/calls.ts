import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  ONBOARDING_FINAL_CONFIRMATION_KEY,
  ONBOARDING_QUESTION_BY_INSIGHT_KEY,
  ONBOARDING_QUESTION_CHECKLIST_KEY_SET,
  ONBOARDING_QUESTION_MIN_COVERED_COUNT,
  getOnboardingAdditionalQuestionKeys,
  getOnboardingQuestionChecklist,
  getOnboardingRequiredQuestionKeys,
  type OnboardingChecklistLocationContext,
} from "@/lib/talentOnboarding/insightChecklist";

export const TALENT_CALL_KIND_CAREER_ONBOARDING = "career_onboarding";
export const TALENT_CALL_STATUS_ACTIVE = "active";
export const TALENT_CALL_STATUS_COMPLETED = "completed";
const COMPLETED_ONBOARDING_ACTIVE_CALL_GUARD_MESSAGE =
  "active career onboarding call is not allowed after onboarding completion";

export type OnboardingChecklistCoverageStatus = "covered";
export type OnboardingChecklistCoverage = Record<
  string,
  OnboardingChecklistCoverageStatus
>;

export type OnboardingChecklistProgress = {
  additionalCoveredCount: number;
  completed: boolean;
  coveredCount: number;
  finalConfirmationCovered: boolean;
  minCoveredCount: number;
  percent: number;
  requiredQuestionsCovered: boolean;
  totalCount: number;
};

export type TalentCallState = {
  checklist?: OnboardingChecklistCoverage;
};

export type TalentCallRow = {
  completed_at: string | null;
  conversation_id: string | null;
  created_at: string;
  id: string;
  kind: string;
  last_active_at: string;
  started_at: string;
  state: Json;
  status: string;
  updated_at: string;
  user_id: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOnboardingChecklistCoverage(
  value: unknown
): OnboardingChecklistCoverage {
  if (!isRecord(value)) return {};

  const coverage: OnboardingChecklistCoverage = {};
  for (const [key, rawStatus] of Object.entries(value)) {
    if (!ONBOARDING_QUESTION_CHECKLIST_KEY_SET.has(key)) continue;
    if (rawStatus === "covered" || rawStatus === true) {
      coverage[key] = "covered";
    }
  }
  return coverage;
}

export function normalizeTalentCallState(value: unknown): TalentCallState {
  if (!isRecord(value)) return { checklist: {} };
  return {
    checklist: normalizeOnboardingChecklistCoverage(value.checklist),
  };
}

export function seedOnboardingChecklistCoverageFromInsights(
  insightContent: Record<string, string> | null | undefined
): OnboardingChecklistCoverage {
  const coverage: OnboardingChecklistCoverage = {};
  for (const [insightKey, checklistKey] of ONBOARDING_QUESTION_BY_INSIGHT_KEY) {
    const value = insightContent?.[insightKey];
    if (typeof value === "string" && value.trim().length > 0) {
      coverage[checklistKey] = "covered";
    }
  }
  return coverage;
}

function mergeCoverage(
  current: OnboardingChecklistCoverage,
  nextKeys: readonly string[]
) {
  const merged: OnboardingChecklistCoverage = { ...current };
  let changedCount = 0;

  for (const key of nextKeys) {
    if (!ONBOARDING_QUESTION_CHECKLIST_KEY_SET.has(key)) continue;
    if (merged[key] === "covered") continue;
    merged[key] = "covered";
    changedCount += 1;
  }

  return { changedCount, coverage: merged };
}

function mergeStateChecklist(
  state: TalentCallState,
  coverage: OnboardingChecklistCoverage
): TalentCallState {
  return {
    ...state,
    checklist: coverage,
  };
}

async function fetchActiveCareerOnboardingCall(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_calls")
    .select("*")
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_CAREER_ONBOARDING)
    .eq("status", TALENT_CALL_STATUS_ACTIVE)
    .order("last_active_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to fetch active talent call");
  }

  return (data ?? null) as TalentCallRow | null;
}

async function fetchTalentOnboardingDone(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const { data, error } = await args.admin
    .from("talent_setting")
    .select("is_onboarding_done")
    .eq("user_id", args.userId)
    .maybeSingle();

  if (error) {
    throw new Error(
      error.message ?? "Failed to check talent onboarding completion"
    );
  }

  return Boolean(data?.is_onboarding_done);
}

function isCompletedOnboardingActiveCallGuardError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "23514" &&
    error.message?.includes(COMPLETED_ONBOARDING_ACTIVE_CALL_GUARD_MESSAGE) ===
      true
  );
}

async function updateTalentCallState(args: {
  admin: TalentAdminClient;
  callId: string;
  state: TalentCallState;
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .update({
      last_active_at: now,
      state: args.state as Json,
      updated_at: now,
    })
    .eq("id", args.callId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to update talent call state");
  }

  return data as TalentCallRow;
}

export async function getOrCreateCareerOnboardingCall(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  initialInsightContent?: Record<string, string> | null;
  userId: string;
}) {
  const seededCoverage = seedOnboardingChecklistCoverageFromInsights(
    args.initialInsightContent
  );
  if (await fetchTalentOnboardingDone(args)) {
    return null;
  }

  const existing = await fetchActiveCareerOnboardingCall(args);

  if (existing) {
    const state = normalizeTalentCallState(existing.state);
    const seededKeys = Object.keys(seededCoverage);
    const merged = mergeCoverage(state.checklist ?? {}, seededKeys);
    const shouldUpdateConversation =
      args.conversationId && existing.conversation_id !== args.conversationId;

    if (merged.changedCount > 0 || shouldUpdateConversation) {
      const now = new Date().toISOString();
      const { data, error } = await args.admin
        .from("talent_calls")
        .update({
          conversation_id: args.conversationId ?? existing.conversation_id,
          last_active_at: now,
          state: mergeStateChecklist(state, merged.coverage) as Json,
          updated_at: now,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        throw new Error(error.message ?? "Failed to update talent call");
      }
      return data as TalentCallRow;
    }

    return existing;
  }

  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .insert({
      conversation_id: args.conversationId ?? null,
      kind: TALENT_CALL_KIND_CAREER_ONBOARDING,
      last_active_at: now,
      state: { checklist: seededCoverage } as Json,
      status: TALENT_CALL_STATUS_ACTIVE,
      user_id: args.userId,
    })
    .select("*")
    .single();

  if (!error) return data as TalentCallRow;

  if (isCompletedOnboardingActiveCallGuardError(error)) {
    return null;
  }

  if (error.code === "23505") {
    const racedCall = await fetchActiveCareerOnboardingCall(args);
    if (racedCall) return racedCall;
    if (await fetchTalentOnboardingDone(args)) return null;
  }

  throw new Error(error.message ?? "Failed to create talent call");
}

export async function getCareerOnboardingChecklistCoverage(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  currentInsightContent?: Record<string, string> | null;
  userId: string;
}) {
  const call = await getOrCreateCareerOnboardingCall({
    admin: args.admin,
    conversationId: args.conversationId,
    initialInsightContent: args.currentInsightContent,
    userId: args.userId,
  });
  if (!call) {
    return seedOnboardingChecklistCoverageFromInsights(
      args.currentInsightContent
    );
  }
  return normalizeTalentCallState(call.state).checklist ?? {};
}

export async function mergeCareerOnboardingChecklistCoverage(args: {
  admin: TalentAdminClient;
  conversationId?: string | null;
  coveredKeys: readonly string[];
  currentInsightContent?: Record<string, string> | null;
  userId: string;
}) {
  const call = await getOrCreateCareerOnboardingCall({
    admin: args.admin,
    conversationId: args.conversationId,
    initialInsightContent: args.currentInsightContent,
    userId: args.userId,
  });
  if (!call) {
    const currentCoverage = seedOnboardingChecklistCoverageFromInsights(
      args.currentInsightContent
    );
    return {
      call: null,
      changedCount: 0,
      coverage: mergeCoverage(currentCoverage, args.coveredKeys).coverage,
    };
  }
  const state = normalizeTalentCallState(call.state);
  const merged = mergeCoverage(state.checklist ?? {}, args.coveredKeys);

  if (merged.changedCount === 0) {
    return {
      call,
      changedCount: 0,
      coverage: merged.coverage,
    };
  }

  const updatedCall = await updateTalentCallState({
    admin: args.admin,
    callId: call.id,
    state: mergeStateChecklist(state, merged.coverage),
  });

  return {
    call: updatedCall,
    changedCount: merged.changedCount,
    coverage: merged.coverage,
  };
}

export async function completeActiveCareerOnboardingCall(args: {
  admin: TalentAdminClient;
  userId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .update({
      completed_at: now,
      last_active_at: now,
      status: TALENT_CALL_STATUS_COMPLETED,
      updated_at: now,
    })
    .eq("user_id", args.userId)
    .eq("kind", TALENT_CALL_KIND_CAREER_ONBOARDING)
    .eq("status", TALENT_CALL_STATUS_ACTIVE)
    .select("*");

  if (error) {
    throw new Error(error.message ?? "Failed to complete talent call");
  }

  const completedCalls = (data ?? []) as TalentCallRow[];
  completedCalls.sort((a, b) =>
    b.last_active_at.localeCompare(a.last_active_at)
  );
  return completedCalls[0] ?? null;
}

export function getOnboardingChecklistCoverageStats(
  coverage: OnboardingChecklistCoverage | null | undefined,
  context?: OnboardingChecklistLocationContext
) {
  const normalized = normalizeOnboardingChecklistCoverage(coverage);
  const checklist = getOnboardingQuestionChecklist(context);
  const additionalQuestionKeys = getOnboardingAdditionalQuestionKeys(context);
  const requiredQuestionKeys = getOnboardingRequiredQuestionKeys(context);
  const coveredCount = checklist.filter(
    (item) => normalized[item.key] === "covered"
  ).length;
  const additionalCoveredCount = additionalQuestionKeys.filter(
    (key) => normalized[key] === "covered"
  ).length;
  const finalConfirmationCovered =
    normalized[ONBOARDING_FINAL_CONFIRMATION_KEY] === "covered";
  const requiredQuestionsCovered = requiredQuestionKeys.every(
    (key) => normalized[key] === "covered"
  );

  return {
    additionalCoveredCount,
    coveredCount,
    finalConfirmationCovered,
    isComplete:
      coveredCount >= ONBOARDING_QUESTION_MIN_COVERED_COUNT &&
      additionalCoveredCount >= additionalQuestionKeys.length &&
      finalConfirmationCovered &&
      requiredQuestionsCovered,
    minCoveredCount: ONBOARDING_QUESTION_MIN_COVERED_COUNT,
    missingItems: checklist.filter(
      (item) => normalized[item.key] !== "covered"
    ),
    requiredQuestionKeys,
    requiredQuestionsCovered,
    totalCount: checklist.length,
  };
}

export function serializeOnboardingChecklistProgress(
  stats: ReturnType<typeof getOnboardingChecklistCoverageStats>
): OnboardingChecklistProgress {
  const coveredCount = Math.max(
    0,
    stats.coveredCount - (stats.finalConfirmationCovered ? 1 : 0)
  );
  const totalCount = Math.max(0, stats.totalCount - 1);
  const percent =
    totalCount > 0
      ? Math.min(100, Math.round((coveredCount / totalCount) * 100))
      : 0;

  return {
    additionalCoveredCount: stats.additionalCoveredCount,
    completed: stats.isComplete,
    coveredCount,
    finalConfirmationCovered: stats.finalConfirmationCovered,
    minCoveredCount: stats.minCoveredCount,
    percent,
    requiredQuestionsCovered: stats.requiredQuestionsCovered,
    totalCount,
  };
}

export async function getCareerOnboardingChecklistProgress(args: {
  admin: TalentAdminClient;
  context?: OnboardingChecklistLocationContext;
  conversationId?: string | null;
  currentInsightContent?: Record<string, string> | null;
  userId: string;
}): Promise<OnboardingChecklistProgress> {
  const coverage = await getCareerOnboardingChecklistCoverage({
    admin: args.admin,
    conversationId: args.conversationId,
    currentInsightContent: args.currentInsightContent,
    userId: args.userId,
  });

  return serializeOnboardingChecklistProgress(
    getOnboardingChecklistCoverageStats(coverage, args.context)
  );
}
