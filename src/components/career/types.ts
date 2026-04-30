import { OpportunityType } from "@/lib/opportunityType";

export { OpportunityType as CareerOpportunityType };

export type CareerStage = "profile" | "chat" | "completed";
export type MessageRole = "assistant" | "user";
export type CareerInputMode = "text" | "voice" | "call";

export type CallTranscriptEntry = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
};

export type CareerTalentUser = {
  user_id: string;
  name: string | null;
  profile_picture: string | null;
  headline: string | null;
  bio: string | null;
  location: string | null;
};

export type CareerTalentExperience = {
  id: number;
  talent_id: string;
  role: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  months: number | null;
  company_id: string | null;
  company_link: string | null;
  company_name: string | null;
  company_location: string | null;
  company_logo: string | null;
  memo: string | null;
};

export type CareerTalentEducation = {
  id: number;
  talent_id: string;
  school: string | null;
  degree: string | null;
  description: string | null;
  field: string | null;
  start_date: string | null;
  end_date: string | null;
  url: string | null;
  memo: string | null;
};

export type CareerTalentExtra = {
  title: string | null;
  description: string | null;
  date: string | null;
  memo: string | null;
};

export type CareerTalentProfile = {
  talentUser: CareerTalentUser | null;
  talentExperiences: CareerTalentExperience[];
  talentEducations: CareerTalentEducation[];
  talentExtras: CareerTalentExtra[];
};

export type CareerNetworkApplication = {
  selectedRole: string | null;
  profileInputTypes: Array<
    "linkedin" | "github" | "scholar" | "website" | "cv"
  >;
  linkedinProfileUrl: string | null;
  githubProfileUrl: string | null;
  scholarProfileUrl: string | null;
  personalWebsiteUrl: string | null;
  submittedAt: string | null;
};

export type CareerTalentPreferences = {
  engagementTypes: string[];
  preferredLocations: string[];
  careerMoveIntent: string | null;
  careerMoveIntentLabel: string | null;
  periodicIntervalDays: number;
  recommendationBatchSize: number;
};

export type CareerTalentInsights = Record<string, string>;

export type CareerOpportunitySavedStage =
  | "saved"
  | "applied"
  | "connected"
  | "closed";

export type CareerHistoryOpportunityCounts = {
  archived: number;
  new: number;
  saved: number;
  savedStages: Record<CareerOpportunitySavedStage, number>;
  total: number;
};

export type CareerRecentOpportunity = {
  id: string;
  kind: "match" | "recommendation";
  opportunityType: OpportunityType;
  title: string;
  companyName: string;
  summary: string | null;
  location: string | null;
  engagementType: string | null;
  matchedAt: string;
  href?: string | null;
};

export type CareerHistoryOpportunityFeedback = "positive" | "negative";

export type CareerPreferenceFitStatus =
  | "Satisfied"
  | "Neutral"
  | "Dissatisfied";

export type CareerPreferenceFitKey =
  | "next_scope"
  | "location"
  | "compensation"
  | "deal_breakers"
  | "must_haves";

export type CareerPreferenceFitItem = {
  key: CareerPreferenceFitKey;
  label: string;
  note: string;
  status: CareerPreferenceFitStatus;
};

export type CareerHistoryOpportunity = {
  clickedAt: string | null;
  companyDescription: string | null;
  companyHomepageUrl: string | null;
  companyLinkedinUrl: string | null;
  companyLogoUrl: string | null;
  companyName: string;
  description: string | null;
  dismissedAt: string | null;
  employmentTypes: string[];
  externalJdUrl: string | null;
  feedback: CareerHistoryOpportunityFeedback | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  href: string | null;
  id: string;
  isAccepted: boolean;
  isInternal: boolean;
  kind: "match" | "recommendation";
  location: string | null;
  opportunityType: OpportunityType;
  postedAt: string | null;
  preferenceFit?: CareerPreferenceFitItem[];
  recommendedAt: string;
  recommendationConcerns?: string[];
  recommendationReasons: string[];
  recommendationSummary?: string | null;
  roleId: string;
  savedStage: CareerOpportunitySavedStage | null;
  sourceJobId: string | null;
  sourceProvider: string | null;
  sourceType: "internal" | "external";
  status: string;
  title: string;
  viewedAt: string | null;
  workMode: string | null;
};

export type CareerTalentNotification = {
  id: number;
  message: string | null;
  isRead: boolean;
  createdAt: string;
};

export type CareerOpportunityRun = {
  chatPreviewCount: number;
  completedAt: string | null;
  coverage: Record<string, unknown>;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  inputLocked: boolean;
  startedAt: string | null;
  status: string;
  targetRecommendationCount: number;
  trigger: string;
};

export type CareerCompanySnapshotSetup = {
  buttonLabel: string;
  cacheWindowDays: number;
  cachedAvailable: boolean;
  companyName: string;
  reason: string | null;
  subtitle: string;
  title: string;
};

export type CareerHistoryItem = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  type:
    | "network_submission"
    | "career_workspace_created"
    | "career_conversation_started"
    | "profile_updated";
};

export type CareerMessage = {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType: string;
  companySnapshotSetup?: CareerCompanySnapshotSetup | null;
  createdAt: string;
  opportunityPreview?: CareerHistoryOpportunity[];
  typing?: boolean;
};

export type CareerMessagePayload = {
  id: number;
  role: MessageRole;
  content: string;
  messageType: string;
  companySnapshotSetup?: CareerCompanySnapshotSetup | null;
  createdAt: string;
  opportunityPreview?: CareerHistoryOpportunity[];
};

export type CareerProfileSettingsMeta = {
  networkApplicationUpdatedAt: string | null;
  talentPreferencesUpdatedAt: string | null;
  talentInsightsUpdatedAt: string | null;
  talentSettingsUpdatedAt: string | null;
  latestUpdatedAt: string | null;
};

export type SessionResponse = {
  activeCompanyRoleCount?: number;
  conversation: {
    id: string;
    stage: CareerStage;
    title: string | null;
    resumeFileName: string | null;
    resumeStoragePath?: string | null;
    resumeDownloadUrl?: string | null;
    resumeLinks: string[];
    reliefNudgeSent: boolean;
  };
  historyItems?: CareerHistoryItem[];
  historyOpportunityCounts?: CareerHistoryOpportunityCounts;
  historyOpportunities?: CareerHistoryOpportunity[];
  notifications?: CareerTalentNotification[];
  networkApplication?: CareerNetworkApplication | null;
  talentPreferences?: CareerTalentPreferences | null;
  talentInsights?: CareerTalentInsights | null;
  recentOpportunities?: CareerRecentOpportunity[];
  profileSettingsMeta?: CareerProfileSettingsMeta;
  talentProfile?: CareerTalentProfile;
  opportunityRun?: CareerOpportunityRun | null;
  messages: CareerMessagePayload[];
  nextBeforeMessageId: number | null;
  nextOpportunityOffset?: number | null;
};
