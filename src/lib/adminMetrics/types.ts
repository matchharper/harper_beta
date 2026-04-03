export const ADMIN_METRIC_KEYS = [
  "signupCount",
  "runCount",
  "revealCount",
  "uniqueProfileViewCount",
  "markedCandidateCount",
  "profileLinkClickCount",
  "chatInputCount",
  "loginUserCount",
  "avgProfileViewsPerUser",
  "avgRunsPerUser",
  "profileEntryToLinkClickRate",
] as const;

export type AdminMetricKey = (typeof ADMIN_METRIC_KEYS)[number];

export type AdminMetricInterval = "day" | "week" | "month";

export type AdminMetricValueType = "count" | "decimal" | "percent";

export type AdminMetricDailyBucket = {
  date: string;
  signupCount: number;
  runCount: number;
  revealCount: number;
  uniqueProfileViewCount: number;
  markedCandidateCount: number;
  profileLinkClickCount: number;
  chatInputCount: number;
  loginUserCount: number;
  profileViewUserCount: number;
  runUserCount: number;
  uniqueProfileViewKeys: string[];
  markedCandidateKeys: string[];
  loginUserIds: string[];
  profileViewUserIds: string[];
  runUserIds: string[];
  linkClickedProfileKeys: string[];
};

export type AdminMetricAggregatedBucket = AdminMetricDailyBucket & {
  label: string;
  fullLabel: string;
};

export type AdminMetricDefinition = {
  key: AdminMetricKey;
  label: string;
  description: string;
  color: string;
  valueType: AdminMetricValueType;
};

export type AdminMetricsResponse = {
  bucketUnit: "day";
  startDate: string;
  endDate: string;
  excludedEmails: string[];
  buckets: AdminMetricDailyBucket[];
  generatedAt: string;
};
