export type AdminCareerFunnelStepKey =
  | "landing_entry"
  | "login"
  | "onboarding_basic"
  | "onboarding_role"
  | "onboarding_profile"
  | "onboarding_visibility"
  | "onboarding_completed"
  | "returned_after_first_recommendation";

export type AdminCareerFunnelStep = {
  key: AdminCareerFunnelStepKey;
  label: string;
  count: number;
  detail: string;
  rateFromPrevious: number | null;
  rateFromEntry: number | null;
};

export type AdminCareerSummaryMetric = {
  key: string;
  label: string;
  value: number;
  detail: string;
  tooltip?: string;
};

export type AdminCareerQuickSignal = {
  key:
    | "signup_to_submission"
    | "submission_to_onboarding"
    | "returned_after_first_recommendation";
  label: string;
  numerator: number;
  denominator: number;
  rate: number | null;
  detail: string;
  tooltip: string;
};

export type AdminCareerLandingSourceBreakdown = {
  source: string;
  entryCount: number;
  loginCount: number;
  eventTypes: string[];
};

export type AdminCareerAnalyticsDateRange = {
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

export type AdminCareerUserRow = {
  userId: string;
  name: string | null;
  email: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  onboardingDone: boolean;
  appOpenCount: number;
  messageCount: number;
  recommendationCount: number;
  viewedRecommendationCount: number;
  jdOpenCount: number;
  companyOpenCount: number;
  statusChangeCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  profileUpdateCount: number;
  firstRecommendationAt: string | null;
  returnedAfterFirstRecommendation: boolean;
  lastMeaningfulAction: string | null;
};

export type AdminCareerSlackSummaryResult = {
  model: string;
  sentAt: string;
  summary: string;
};

export type AdminCareerAnalyticsResponse = {
  generatedAt: string;
  dateRange: AdminCareerAnalyticsDateRange;
  excludedEmails: string[];
  funnel: AdminCareerFunnelStep[];
  landingSources: AdminCareerLandingSourceBreakdown[];
  quickSignals: AdminCareerQuickSignal[];
  slackSummary?: AdminCareerSlackSummaryResult;
  summary: AdminCareerSummaryMetric[];
  users: AdminCareerUserRow[];
};
