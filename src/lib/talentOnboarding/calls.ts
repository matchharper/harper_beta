import type { Json } from "@/types/database.types";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  ONBOARDING_ADDITIONAL_QUESTION_KEYS,
  ONBOARDING_FINAL_CONFIRMATION_KEY,
  ONBOARDING_QUESTION_BY_INSIGHT_KEY,
  ONBOARDING_QUESTION_CHECKLIST,
  ONBOARDING_QUESTION_CHECKLIST_KEY_SET,
  ONBOARDING_QUESTION_MIN_COVERED_COUNT,
} from "@/lib/talentOnboarding/insightChecklist";

export const TALENT_CALL_KIND_CAREER_ONBOARDING = "career_onboarding";
export const TALENT_CALL_STATUS_ACTIVE = "active";
export const TALENT_CALL_STATUS_COMPLETED = "completed";

export type OnboardingChecklistCoverageStatus = "covered";
export type OnboardingChecklistCoverage = Record<
  string,
  OnboardingChecklistCoverageStatus
>;

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

  if (error.code === "23505") {
    const racedCall = await fetchActiveCareerOnboardingCall(args);
    if (racedCall) return racedCall;
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
  const call = await fetchActiveCareerOnboardingCall(args);
  if (!call) return null;

  const now = new Date().toISOString();
  const { data, error } = await args.admin
    .from("talent_calls")
    .update({
      completed_at: now,
      last_active_at: now,
      status: TALENT_CALL_STATUS_COMPLETED,
      updated_at: now,
    })
    .eq("id", call.id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message ?? "Failed to complete talent call");
  }

  return data as TalentCallRow;
}

export function getOnboardingChecklistCoverageStats(
  coverage: OnboardingChecklistCoverage | null | undefined
) {
  const normalized = normalizeOnboardingChecklistCoverage(coverage);
  const coveredCount = ONBOARDING_QUESTION_CHECKLIST.filter(
    (item) => normalized[item.key] === "covered"
  ).length;
  const additionalCoveredCount = ONBOARDING_ADDITIONAL_QUESTION_KEYS.filter(
    (key) => normalized[key] === "covered"
  ).length;
  const finalConfirmationCovered =
    normalized[ONBOARDING_FINAL_CONFIRMATION_KEY] === "covered";

  return {
    additionalCoveredCount,
    coveredCount,
    finalConfirmationCovered,
    isComplete:
      coveredCount >= ONBOARDING_QUESTION_MIN_COVERED_COUNT &&
      additionalCoveredCount >= ONBOARDING_ADDITIONAL_QUESTION_KEYS.length &&
      finalConfirmationCovered,
    minCoveredCount: ONBOARDING_QUESTION_MIN_COVERED_COUNT,
    missingItems: ONBOARDING_QUESTION_CHECKLIST.filter(
      (item) => normalized[item.key] !== "covered"
    ),
    totalCount: ONBOARDING_QUESTION_CHECKLIST.length,
  };
}
