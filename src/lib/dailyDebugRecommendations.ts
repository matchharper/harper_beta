import {
  isCandidateRequestedRecommendation,
  isInternalOpportunity,
  normalizeRecommendationFeedback,
} from "./dailyStatsOpportunity";

export type DebugCount = { count: number; users: number };
export type DebugRecommendationGroup = Record<
  | "recommended"
  | "candidateRequested"
  | "likes"
  | "dislikes"
  | "kept"
  | "saved"
  | "views"
  | "clicks"
  | "applyClicks"
  | "applyRequests"
  | "directApplyClicks"
  | "confirmed"
  | "submitted",
  DebugCount
>;
export type DebugRecommendationStats = {
  external: DebugRecommendationGroup;
  internal: DebugRecommendationGroup;
  externalSubmissionCoverage: "recorded_application_flow_only";
};
export type DebugRecommendation = {
  id: string;
  talent_id: string;
  role_id: string;
  opportunity_type: string;
  created_at: string;
  viewed_at: string | null;
  clicked_at: string | null;
  evidence?: unknown;
  feedback?: string | null;
  feedback_at?: string | null;
};
export type DebugOpportunityProgress = {
  id: string;
  talent_id: string;
  role_id: string;
  recommendation_id: string | null;
  kind: string;
  created_at: string;
  feedback: string | null;
  savedStage: string | null;
};
export type DebugApplicationClick = {
  id: string;
  user_id: string;
  type: string;
  created_at: string;
};
export const DEBUG_APPLICATION_CLICK_TYPES = [
  "career_click_history_external_apply",
  "career_click_mobile_history_external_apply",
  "career_click_apply_with_harper",
  "career_click_history_external_apply_directly",
  "career_click_mobile_history_external_apply_directly",
  "career_view_history_internal_connection_acceptance_modal",
] as const;
export type DebugInternalAcceptance = {
  id: string;
  root_id: string;
  talent_id: string;
  role_id: string;
  created_at: string;
  direction: string;
  material_id: string | null;
  legacyCorrespondence: string | null;
};
export type DebugApplicationAttempt = {
  id: string;
  status: string;
  startedAt: string;
  updatedAt: string;
  transmissionAttemptedAt?: string;
  managed?: { authorizedReviewFingerprint?: string };
  approval?: {
    approved?: boolean;
    executed?: boolean;
    evidenceMessageId?: number;
  };
  result?: { evidence?: string };
};
export type DebugApplication = {
  user_id: string;
  attempts: DebugApplicationAttempt[];
};
export function emptyDebugRecommendationGroup(): DebugRecommendationGroup {
  return Object.fromEntries(
    [
      "recommended",
      "candidateRequested",
      "likes",
      "dislikes",
      "kept",
      "saved",
      "views",
      "clicks",
      "applyClicks",
      "applyRequests",
      "directApplyClicks",
      "confirmed",
      "submitted",
    ].map((key) => [key, { count: 0, users: 0 }])
  ) as DebugRecommendationGroup;
}

export function buildDebugRecommendationStats(args: {
  startIso: string;
  endIso: string;
  recommendations: DebugRecommendation[];
  progress: DebugOpportunityProgress[];
  clicks: DebugApplicationClick[];
  internalAcceptances: DebugInternalAcceptance[];
  applications: DebugApplication[];
  evidenceMessages: { id: number; user_id: string; created_at: string }[];
}): DebugRecommendationStats {
  const result: DebugRecommendationStats = {
    external: emptyDebugRecommendationGroup(),
    internal: emptyDebugRecommendationGroup(),
    externalSubmissionCoverage: "recorded_application_flow_only",
  };
  const inDay = (value: string | null | undefined) =>
    Boolean(
      value &&
      Date.parse(value) >= Date.parse(args.startIso) &&
      Date.parse(value) < Date.parse(args.endIso)
    );
  const counters = new Map<string, Map<string, string>>();
  const add = (
    group: "external" | "internal",
    metric: keyof DebugRecommendationGroup,
    event: string,
    user: string
  ) => {
    const key = `${group}:${metric}`;
    const events = counters.get(key) ?? new Map<string, string>();
    events.set(event, user);
    counters.set(key, events);
  };
  const recommendations = new Map(args.recommendations.map((r) => [r.id, r]));
  const groupFor = (id: string | null, user: string) => {
    const rec = id ? recommendations.get(id) : undefined;
    if (!rec || rec.talent_id !== user)
      throw new Error("추천 반응의 외부·내부 구분에 필요한 추천 기록 누락");
    return isInternalOpportunity(rec.opportunity_type)
      ? "internal"
      : "external";
  };
  for (const rec of args.recommendations) {
    const group = groupFor(rec.id, rec.talent_id);
    if (inDay(rec.created_at)) {
      add(group, "recommended", rec.id, rec.talent_id);
      if (group === "internal" && isCandidateRequestedRecommendation(rec.evidence))
        add(group, "candidateRequested", rec.id, rec.talent_id);
    }
    if (inDay(rec.viewed_at)) add(group, "views", rec.id, rec.talent_id);
    if (inDay(rec.clicked_at)) add(group, "clicks", rec.id, rec.talent_id);
  }
  // Append-only decisions preserve yesterday's reaction even if changed today.
  for (const row of args.progress) {
    if (!inDay(row.created_at) || !row.recommendation_id) continue;
    const group = groupFor(row.recommendation_id, row.talent_id);
    if (row.kind === "saved_stage_changed" && row.savedStage === "saved")
      add(group, "saved", row.id, row.talent_id);
    if (row.kind !== "candidate_opportunity_feedback_changed") continue;
    const feedback = normalizeRecommendationFeedback(row.feedback);
    if (feedback === "positive") add(group, "likes", row.id, row.talent_id);
    if (feedback === "negative") add(group, "dislikes", row.id, row.talent_id);
    if (row.feedback === "keep") add(group, "kept", row.id, row.talent_id);
  }
  // The progress trigger records updates, not insert-time feedback. Include
  // that persisted first reaction only when no decision event covers the day.
  const recordedFeedback = new Set(
    args.progress
      .filter(
        (r) =>
          r.kind === "candidate_opportunity_feedback_changed" &&
          inDay(r.created_at)
      )
      .map((r) => r.recommendation_id)
  );
  for (const rec of args.recommendations) {
    if (!inDay(rec.feedback_at) || recordedFeedback.has(rec.id)) continue;
    const feedback = normalizeRecommendationFeedback(rec.feedback);
    const group = groupFor(rec.id, rec.talent_id);
    if (feedback === "positive")
      add(group, "likes", `initial:${rec.id}`, rec.talent_id);
    if (feedback === "negative")
      add(group, "dislikes", `initial:${rec.id}`, rec.talent_id);
    if (rec.feedback === "keep")
      add(group, "kept", `initial:${rec.id}`, rec.talent_id);
  }
  for (const row of args.clicks) {
    if (!inDay(row.created_at)) continue;
    if (row.type === "career_view_history_internal_connection_acceptance_modal")
      add("internal", "applyClicks", row.id, row.user_id);
    else if (
      [
        "career_click_history_external_apply",
        "career_click_mobile_history_external_apply",
      ].includes(row.type)
    )
      add("external", "applyClicks", row.id, row.user_id);
    // The modal also emits click_history_external_apply_with_harper for the same
    // click. Count only the shared button's event to avoid double counting.
    else if (row.type === "career_click_apply_with_harper")
      add("external", "applyRequests", row.id, row.user_id);
    else if (
      [
        "career_click_history_external_apply_directly",
        "career_click_mobile_history_external_apply_directly",
      ].includes(row.type)
    )
      add("external", "directApplyClicks", row.id, row.user_id);
  }
  for (const row of args.internalAcceptances) {
    if (
      !inDay(row.created_at) ||
      row.id !== row.root_id ||
      row.direction !== "to_company" ||
      row.legacyCorrespondence === "true"
    )
      continue;
    add("internal", "confirmed", row.id, row.talent_id);
    // Introduction acceptance pins the authorized materials and delivers the
    // contact to the company's agent atomically; it is not a company decision.
    if (row.material_id) add("internal", "submitted", row.id, row.talent_id);
  }
  const messages = new Map(args.evidenceMessages.map((m) => [m.id, m]));
  for (const application of args.applications) {
    for (const attempt of application.attempts) {
      const evidence = attempt.approval?.evidenceMessageId
        ? messages.get(attempt.approval.evidenceMessageId)
        : undefined;
      const approvedAt = attempt.managed?.authorizedReviewFingerprint
        ? attempt.startedAt
        : attempt.approval?.approved &&
            evidence?.user_id === application.user_id
          ? evidence.created_at
          : undefined;
      if (inDay(approvedAt))
        add("external", "confirmed", attempt.id, application.user_id);
      // Same receipt contract as applicationSubmissionState; a succeeded
      // browser or an editable "applied" stage alone proves no submission.
      if (
        attempt.status === "succeeded" &&
        attempt.approval?.approved &&
        attempt.approval.executed &&
        attempt.result?.evidence?.trim() &&
        inDay(attempt.updatedAt)
      )
        add("external", "submitted", attempt.id, application.user_id);
    }
  }
  for (const [key, events] of counters) {
    const [group, metric] = key.split(":") as [
      "external" | "internal",
      keyof DebugRecommendationGroup,
    ];
    result[group][metric] = {
      count: events.size,
      users: new Set(events.values()).size,
    };
  }
  return result;
}
