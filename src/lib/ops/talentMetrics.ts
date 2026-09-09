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
  internalMaturedRecommendationCount: number;
  onboardingCompletedWithin14DaysCount: number;
  onboardingCompletionRate: number | null;
  onboardingMaturedSignupCount: number;
  pendingConnectionTalentCount: number;
  recommendationAcceptRejectRatio: number | null;
  recommendationAcceptedCount: number;
  recommendationDecisionAcceptanceRate: number | null;
  recommendationRejectedCount: number;
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
  wau: number;
};

export type OpsTalentMetricDailyActivityPoint = {
  activeTalentCount: number;
  date: string;
  fullLabel: string;
  label: string;
};

export type OpsTalentMetricConversionTrendPoint = {
  bucketStart: string;
  connectedTalentCount: number;
  fullLabel: string;
  internalAcceptanceRate: number | null;
  label: string;
  onboardingCompletionRate: number | null;
  pendingConnectionTalentCount: number;
  recommendationAcceptRejectRatio: number | null;
  recommendationAcceptedCount: number;
  recommendationDecisionAcceptanceRate: number | null;
  recommendationRejectedCount: number;
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
