export type OpsTalentMetricInterval = "day" | "week" | "month";

export type OpsTalentMetricFilters = {
  from: string;
  interval: OpsTalentMetricInterval;
  to: string;
};

export type OpsTalentMetricConversionSummary = {
  connectedTalentCount: number;
  internalAcceptedCount: number;
  internalAcceptanceRate: number | null;
  /**
   * Internal Role recommendations (talent × Role) first made in the period, including those under 14 days old.
   * Absent in a snapshot computed by get_ops_talent_metrics_conversion_v1, until it is recomputed.
   */
  internalRecommendationPairCount?: number;
  onboardingCompletedWithin14DaysCount: number;
  onboardingCompletionRate: number | null;
  /** Signups in the period, including those under 14 days old. Absent in a v1 snapshot, like the field above. */
  onboardingSignupCount?: number;
  pendingConnectionTalentCount: number;
  recommendationAcceptRejectRatio: number | null;
  recommendationAcceptedCount: number;
  recommendationDecisionAcceptanceRate: number | null;
  recommendationRejectedCount: number;
  /** Absent in older RPCs and cached responses until the feedback migration is applied. */
  recommendationFeedbackTalentCount?: number | null;
  serviceReadyTalentCount: number;
  serviceReadyTalentQuarterEquivalents: number;
  verifiedConnectionYieldPer100TalentQuarters: number | null;
};

export type OpsTalentMetricEngagementSummary = {
  dau: number;
  interactionTalentCount: number;
  messageCharacterCount: number;
  messageCount: number;
  messageSenderCount: number;
  retainedTalentCount: number;
  retentionBaseTalentCount: number;
  retentionRate: number | null;
  /** 요약 DAU·WAU의 기준인 마지막으로 끝난 KST 날짜(YYYY-MM-DD). 이전 DB 함수에는 없다. */
  summaryDate?: string | null;
  wau: number;
};

export type OpsTalentMetricDailyActivityPoint = {
  activeTalentCount: number;
  /**
   * 그날 포함 지난 7일 DAU의 평균(소수 1자리). 진행 중인 오늘은 null.
   * 20261116020000 migration 전의 DB 함수와 캐시된 응답에는 없다.
   */
  activeTalentCount7dAvg?: number | null;
  date: string;
  fullLabel: string;
  label: string;
};

export type OpsTalentMetricConversionTrendPoint = {
  bucketStart: string;
  internalRecommendationCount: number;
  connectedTalentCount: number;
  fullLabel: string;
  internalAcceptanceRate: number | null;
  label: string;
  onboardingCompletionRate: number | null;
  pendingConnectionTalentCount: number;
  recommendationAcceptRejectRatio: number | null;
  recommendationAcceptedCount: number;
  recommendationCount: number;
  recommendationDecisionAcceptanceRate: number | null;
  recommendationRejectedCount: number;
  recommendationFeedbackTalentCount?: number | null;
  serviceReadyTalentQuarterEquivalents: number;
  verifiedConnectionYieldPer100TalentQuarters: number | null;
};

export type OpsTalentMetricEngagementTrendPoint = {
  bucketStart: string;
  fullLabel: string;
  interactionTalentCount: number;
  label: string;
  messageCharacterCount: number;
  messageCount: number;
};

export type OpsTalentMetricRetentionPoint = {
  activeTalentCount: number;
  /** Monday–Sunday cumulative people; future days are null. Older RPC responses omit the field. */
  weekdayCumulativeActiveTalentCounts?: Array<number | null> | null;
  cohortStart: string;
  fullLabel: string;
  label: string;
  retainedTalentCount: number;
  retentionBaseTalentCount: number;
  retentionRate: number | null;
};

export type OpsTalentMetricWeeklyRetentionCell = {
  activeTalentCount: number;
  isComplete: boolean;
  retentionRate: number | null;
  weekIndex: number;
};

export type OpsTalentMetricWeeklyRetentionCohort = {
  cohortStart: string;
  fullLabel: string;
  label: string;
  signupCount: number;
  weeks: OpsTalentMetricWeeklyRetentionCell[];
};

type OpsTalentMetricsSectionResponse = {
  filters: OpsTalentMetricFilters;
  generatedAt: string;
  sourceLimitReached: boolean;
};

export type OpsTalentMetricsConversionResponse =
  OpsTalentMetricsSectionResponse & {
    comparison: OpsTalentMetricConversionSummary;
    summary: OpsTalentMetricConversionSummary;
    trend: OpsTalentMetricConversionTrendPoint[];
  };

export type OpsTalentMetricsEngagementResponse =
  OpsTalentMetricsSectionResponse & {
    comparison: OpsTalentMetricEngagementSummary;
    dailyActivity: OpsTalentMetricDailyActivityPoint[];
    retention: OpsTalentMetricRetentionPoint[];
    summary: OpsTalentMetricEngagementSummary;
    trend: OpsTalentMetricEngagementTrendPoint[];
  };

export type OpsTalentMetricsRetentionResponse =
  OpsTalentMetricsSectionResponse & {
    weeklyRetentionCohorts: OpsTalentMetricWeeklyRetentionCohort[];
  };

export type OpsTalentMetricsSection = "conversion" | "engagement" | "retention";

export type OpsTalentMetricsResponseBySection = {
  conversion: OpsTalentMetricsConversionResponse;
  engagement: OpsTalentMetricsEngagementResponse;
  retention: OpsTalentMetricsRetentionResponse;
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function toKstDateOnly(valueMs: number) {
  return new Date(valueMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Quick range buttons: the last N days, ending today (KST). */
export const OPS_TALENT_METRICS_QUICK_RANGE_DAYS = [30, 90, 180] as const;

export function opsTalentMetricsRollingRange(days: number, nowMs = Date.now()) {
  return {
    from: toKstDateOnly(nowMs - (days - 1) * DAY_MS),
    to: toKstDateOnly(nowMs),
  };
}

/**
 * How a range is kept between views. A quick range is "the last N days", so tomorrow's view starts from today's
 * result and is recomputed for tomorrow's dates; other ranges stay as their dates.
 */
export function opsTalentMetricsSnapshotRange(
  range: { from: string; to: string },
  nowMs = Date.now()
): { key: string; resolve: (atMs: number) => { from: string; to: string } } {
  const days = OPS_TALENT_METRICS_QUICK_RANGE_DAYS.find((value) => {
    const rolling = opsTalentMetricsRollingRange(value, nowMs);
    return rolling.from === range.from && rolling.to === range.to;
  });
  if (days) {
    return { key: `last${days}`, resolve: (atMs) => opsTalentMetricsRollingRange(days, atMs) };
  }
  return { key: `${range.from}~${range.to}`, resolve: () => range };
}
