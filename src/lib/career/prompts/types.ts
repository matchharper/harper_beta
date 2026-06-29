export type CareerPromptProfile = {
  current_location?: string | null;
  resume_file_name?: string | null;
  resume_links?: string[] | null;
  resume_text?: string | null;
  location?: string | null;
};

export type CareerPromptPreferences = {
  getExternalRecommendation?: boolean | null;
  getInternalRecommendation?: boolean | null;
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

export type CareerOpportunityFeedbackFollowUpTrigger =
  | "all_visible_feedback_submitted"
  | "all_recommended_opportunities_cleared"
  | "delayed_external_feedback"
  | "immediate_internal_feedback";

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
export type CareerProactiveTurnInstructionMode =
  | "conversation_starter"
  | "internal_opportunity_call"
  | "generic";
export type CareerToolPolicyChannel = CareerPromptChannel;

export type CareerPromptPlan = {
  enabledToolNames: string[];
  isOnboardingActive: boolean;
  promptBlocks: CareerPromptBlock[];
  toolPolicy: string;
};

export type OnboardingChecklistCoverage = Record<string, "covered">;
