export type CareerPromptProfile = {
  current_location?: string | null;
  resume_file_name?: string | null;
  resume_links?: string[] | null;
  resume_text?: string | null;
  location?: string | null;
};

export type CareerPromptPreferences = {
  getExternalRecommendation?: boolean | null;
  periodicIntervalDays?: number | null;
  preferredLocale?: string | null;
  profileVisibility?: string | null;
  recommendationBatchSize?: number | null;
  talentSettingStatus?: string | null;
};

export type CareerPromptOpportunityStatus = {
  activeRunCreatedAt?: string | null;
  activeRunStatus?: string | null;
  isInitialSearchRunning?: boolean;
  onboardingCompletedAt?: string | null;
};

export type CareerPromptActivitySummary = {
  created_at: string;
  summary: string;
};

export type CareerTranscriptEntry = {
  role: "user" | "assistant";
  text: string;
};

export const CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER = {
  AllRecommendedOpportunitiesCleared: "all_recommended_opportunities_cleared",
  DelayedExternalFeedback: "delayed_external_feedback",
  ImmediateInternalFeedback: "immediate_internal_feedback",
} as const;

export type CareerOpportunityFeedbackFollowUpTrigger =
  (typeof CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER)[keyof typeof CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER];

export const CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER_VALUES =
  Object.values(CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER);

export function isCareerOpportunityFeedbackFollowUpTrigger(
  value: unknown
): value is CareerOpportunityFeedbackFollowUpTrigger {
  return (
    typeof value === "string" &&
    CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER_VALUES.includes(
      value as CareerOpportunityFeedbackFollowUpTrigger
    )
  );
}

export type CareerRealtimeRecentMessage = {
  content: string;
  createdAt?: string | null;
  role: string;
};

export type CareerPromptBlock = {
  cacheable?: boolean;
  key: string;
  text: string;
};

export type CareerPromptChannel = "chat" | "voice";
export type CareerConversationPromptMode =
  | "default"
  | "preference_update"
  | "match_quality"
  | "internal_opportunity_call";
export type CareerToolPolicyChannel = CareerPromptChannel;

export type CareerPromptPlan = {
  enabledToolNames: string[];
  isOnboardingActive: boolean;
  promptBlocks: CareerPromptBlock[];
  toolPolicy: string;
};

export type OnboardingChecklistCoverage = Record<string, "covered">;
