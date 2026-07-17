export type AdminCareerFunnelStepKey =
  | "landing_entry"
  | "login_click"
  | "login"
  | "signup"
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

export type AdminCareerLandingVariantBreakdown = {
  abtestType: string;
  clickStartCount: number;
  clickStartRateFromEntry: number | null;
  description: string;
  emailSentCount: number;
  emailSentRateFromSubmit: number | null;
  emailSubmitCount: number;
  emailSubmitRateFromEntry: number | null;
  entryCount: number;
  eventTypes: string[];
  label: string;
  loginCount: number;
  loginRateFromClickStart: number | null;
  loginRateFromEntry: number | null;
  signupCount: number;
  signupRateFromEntry: number | null;
  signupRateFromLogin: number | null;
};

export type AdminCareerDeviceType = "desktop" | "mobile" | "unknown";

export type AdminCareerDeviceComparisonRow = {
  device: AdminCareerDeviceType;
  label: string;
  entryCount: number;
  loginCount: number;
  loginRateFromEntry: number | null;
  submittedCount: number;
  submissionRateFromEntry: number | null;
  submissionRateFromLogin: number | null;
  onboardingCompletedCount: number;
  onboardingCompletionRateFromEntry: number | null;
  onboardingCompletionRateFromSubmitted: number | null;
  firstRecommendedCount: number;
  returnedAfterFirstRecommendationCount: number;
  returnRateFromEntry: number | null;
  returnRateFromFirstRecommendation: number | null;
};

export type AdminCareerAnalyticsDateRange = {
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
};

export type AdminCareerSlackSummaryResult = {
  model: string;
  sentAt: string;
  summary: string;
};

export type AdminCareerAnalyticsResponse = {
  generatedAt: string;
  dateRange: AdminCareerAnalyticsDateRange;
  deviceComparison: AdminCareerDeviceComparisonRow[];
  excludedEmails: string[];
  funnel: AdminCareerFunnelStep[];
  landingSources: AdminCareerLandingSourceBreakdown[];
  landingVariants: AdminCareerLandingVariantBreakdown[];
  quickSignals: AdminCareerQuickSignal[];
  slackSummary?: AdminCareerSlackSummaryResult;
  summary: AdminCareerSummaryMetric[];
};

export type AdminCareerUtmSourceRow = {
  id: string;
  source: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  lastEnteredAt: string | null;
  entryCount: number;
  loginCount: number;
  identifiedUserCount: number;
};

export type AdminCareerUtmPerson = {
  localId: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  firstEnteredAt: string | null;
  lastEnteredAt: string | null;
  lastLoginAt: string | null;
  currentStepKey: AdminCareerFunnelStepKey;
  currentStepLabel: string;
};

export type AdminCareerUtmSourceDetail = {
  source: string;
  steps: AdminCareerFunnelStep[];
  people: AdminCareerUtmPerson[];
};

export type AdminCareerUtmResponse = {
  generatedAt: string;
  sources: AdminCareerUtmSourceRow[];
  selectedSource: AdminCareerUtmSourceDetail | null;
};

export type AdminCareerJobFunnelStepKey = "job_view" | "talk_click" | "login";

export type AdminCareerJobFunnelStep = {
  key: AdminCareerJobFunnelStepKey;
  label: string;
  count: number;
  detail: string;
  rateFromPrevious: number | null;
  rateFromView: number | null;
};

export type AdminCareerJobRow = {
  jobSlug: string;
  roleTitle: string;
  companyName: string;
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  talkClickCount: number;
  talkClickRate: number | null;
  loginCount: number;
  lastViewedAt: string | null;
  lastTalkClickedAt: string | null;
};

export type AdminCareerJobViewer = {
  localId: string;
  email: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  talkClickedAt: string | null;
  loginAt: string | null;
  currentStepKey: AdminCareerJobFunnelStepKey;
  currentStepLabel: string;
};

export type AdminCareerJobDetail = AdminCareerJobRow & {
  steps: AdminCareerJobFunnelStep[];
  people: AdminCareerJobViewer[];
};

export type AdminCareerJobsResponse = {
  generatedAt: string;
  jobs: AdminCareerJobRow[];
  selectedJob: AdminCareerJobDetail | null;
};
