export const ADMIN_CAREER_ACTIVITY_INTERVALS = [
  "day",
  "week",
  "month",
] as const;

export type AdminCareerActivityInterval =
  (typeof ADMIN_CAREER_ACTIVITY_INTERVALS)[number];

export const ADMIN_CAREER_ACTIVITY_EVENT_KINDS = [
  "signup",
  "visit",
  "login",
  "textChat",
  "voice",
  "email",
  "feedback",
  "positionView",
] as const;

export type AdminCareerActivityEventKind =
  (typeof ADMIN_CAREER_ACTIVITY_EVENT_KINDS)[number];

export type AdminCareerActivityEvent = {
  kind: AdminCareerActivityEventKind;
  occurredAt: string;
  userId: string;
};

export type AdminCareerActivityMetricValues = {
  activityCount: number;
  careerVisitorCount: number;
  emailCount: number;
  feedbackCount: number;
  interactingTalentCount: number;
  liveDbTalentCount: number;
  positionViewCount: number;
  signupCount: number;
  textChatCount: number;
  voiceCount: number;
};

export type AdminCareerActivityBucket = AdminCareerActivityMetricValues & {
  endDate: string;
  label: string;
  startDate: string;
};

export type AdminCareerActivityResponse = {
  endDate: string;
  excludedEmails: string[];
  generatedAt: string;
  series: Record<AdminCareerActivityInterval, AdminCareerActivityBucket[]>;
  startDate: string;
  timezone: "Asia/Seoul";
  totals: AdminCareerActivityMetricValues;
};
