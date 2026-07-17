import { OpportunityType } from "@/lib/opportunityType";
import type { OpportunityDiscoveryAgentVariant } from "@/lib/opportunityDiscovery/types";
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
export {
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER,
  CAREER_OPPORTUNITY_FEEDBACK_FOLLOW_UP_TRIGGER_VALUES,
  isCareerOpportunityFeedbackFollowUpTrigger,
} from "@/lib/career/prompts/types";
export type { CareerOpportunityFeedbackFollowUpTrigger } from "@/lib/career/prompts/types";

export { OpportunityType as CareerOpportunityType };

export type CareerStage = "profile" | "chat" | "completed";
export type MessageRole = "assistant" | "user";
export type CareerInputMode = "text" | "call";
export type CareerCallStartRequest =
  | string
  | {
      conversationStarterId?: CareerConversationStarterId | null;
      forceBeginOnboarding?: boolean;
      internalCallRequestId?: string | null;
      openingText?: string;
    };
export type CallLiveTranscriptPlacement =
  | "beforeCurrentAssistant"
  | "afterCurrentAssistant";

export type CareerRecommendationSearchStatusState =
  | "running"
  | "completed"
  | "error"
  | "stopped";

export type CareerRecommendationSearchStatus = {
  candidateCount?: number | null;
  recommendationCount?: number | null;
  state: CareerRecommendationSearchStatusState;
};

export type CareerOpportunityAgentVariant = OpportunityDiscoveryAgentVariant;

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
  employment_type: string | null;
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

export type CareerTalentPreferences = {
  engagementTypes: string[];
  getExternalRecommendation: boolean;
  getInternalRecommendation: boolean;
  isOnboardingDone: boolean;
  periodicIntervalDays: number;
  recommendationBatchSize: number;
};

export type CareerTalentInsights = Record<string, string>;

export type CareerInterviewProgress = {
  canForceComplete: boolean;
  filledCount: number;
  percent: number;
  remainingCount: number;
  totalCount: number;
};

export type CareerOnboardingChecklistProgress = {
  additionalCoveredCount: number;
  completed: boolean;
  coveredCount: number;
  finalConfirmationCovered: boolean;
  minCoveredCount: number;
  percent: number;
  requiredQuestionsCovered: boolean;
  totalCount: number;
};

export type CareerOpportunitySavedStage =
  | "saved"
  | "applied"
  | "connected"
  | "closed"
  | "hidden";

export type CareerOpportunitySavedStageFilter =
  | CareerOpportunitySavedStage
  | "all";

export type CareerHistoryTabId = "new" | "saved" | "archived";

export type CareerInternalRecommendationProgressCode =
  | "awaiting_company_response"
  | "closed_by_company"
  | "company_acknowledged_awaiting_response"
  | "company_next_process"
  | "no_company_response_closed"
  | "waiting_to_share";

export type CareerInternalRecommendationProgressStage =
  | "accepted"
  | "archived"
  | "custom"
  | "final_offer"
  | "hold"
  | "pending_connection"
  | "process_stopped"
  | "rejected";

export type CareerInternalRecommendationProgress = {
  acceptedAt: string;
  code: CareerInternalRecommendationProgressCode;
  daysSinceAccepted: number | null;
  daysSinceStageChanged: number | null;
  message: string;
  stage: CareerInternalRecommendationProgressStage | null;
  stageChangedAt: string | null;
  stageTag: string | null;
};

export type CareerOpportunityCompanyData = {
  confidence?: number | null;
  lastFundingRoundDescription?: string | null;
  lastFundingStage?: string | null;
  mainInvestors?: string | null;
  searchedAt?: string | null;
  totalFundingRaised?: string | null;
};

export type CareerHistoryOpportunityPageFilter = {
  historyTab: CareerHistoryTabId;
  savedStage?: CareerOpportunitySavedStageFilter;
};

export type CareerHistoryOpportunityCounts = {
  archived: number;
  new: number;
  newInternal: number;
  saved: number;
  savedStages: Record<CareerOpportunitySavedStage, number>;
  total: number;
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
  companyData?: CareerOpportunityCompanyData | null;
  companyDescription: string | null;
  companyDbId?: number | null;
  companyHomepageUrl: string | null;
  companyLinkedinUrl: string | null;
  companyLogoUrl: string | null;
  companyName: string;
  description: string | null;
  employmentTypes: string[];
  externalJdUrl: string | null;
  expiresAt?: string | null;
  feedback: CareerHistoryOpportunityFeedback | null;
  feedbackAt: string | null;
  feedbackReason: string | null;
  href: string | null;
  id: string;
  isExpired?: boolean;
  isAccepted: boolean;
  isInternal: boolean;
  internalProgress?: CareerInternalRecommendationProgress | null;
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
  talentMemo?: string | null;
  title: string;
  viewedAt: string | null;
  workMode: string | null;
};

export type CareerOpportunityRun = {
  agentVariant: CareerOpportunityAgentVariant | null;
  completedAt: string | null;
  coverage: Record<string, unknown>;
  createdAt: string;
  errorMessage: string | null;
  id: string;
  inputLocked: boolean;
  startedAt: string | null;
  status: string;
  trigger: string;
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
  createdAt: string;
  opportunityPreview?: CareerHistoryOpportunity[];
  recommendationStatusAfterCharCount?: number | null;
  thinkingLogs?: string[];
  typing?: boolean;
  typingMode?: "word";
};

export type CareerMessagePayload = {
  id: number;
  role: MessageRole;
  content: string;
  messageType: string;
  createdAt: string;
  opportunityPreview?: CareerHistoryOpportunity[];
  recommendationStatusAfterCharCount?: number | null;
  thinkingLogs?: string[];
};

export type CareerInternalOpportunityCallRequest = {
  companyLogoUrl: string | null;
  companyName: string;
  createdAt: string;
  id: string;
  opportunityId: string;
  questions: string[];
  reason: string | null;
  resumePromptNeeded: boolean;
  roleId: string;
  roleTitle: string;
  status: string;
  updatedAt: string;
};

export type CareerProfileSettingsMeta = {
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
    resumeFileName: string | null;
    resumeStoragePath?: string | null;
    resumeDownloadUrl?: string | null;
    resumeLinks: string[];
    reliefNudgeSent: boolean;
  };
  historyItems?: CareerHistoryItem[];
  historyOpportunitiesIncluded?: boolean;
  historyOpportunityCounts?: CareerHistoryOpportunityCounts;
  historyOpportunities?: CareerHistoryOpportunity[];
  talentPreferences?: CareerTalentPreferences | null;
  talentInsights?: CareerTalentInsights | null;
  onboardingChecklistProgress?: CareerOnboardingChecklistProgress | null;
  profileSettingsMeta?: CareerProfileSettingsMeta;
  talentProfile?: CareerTalentProfile;
  opportunityRun?: CareerOpportunityRun | null;
  pendingInternalOpportunityCallRequest?: CareerInternalOpportunityCallRequest | null;
  pendingInternalOpportunityCallRequests?: CareerInternalOpportunityCallRequest[];
  messages: CareerMessagePayload[];
  nextBeforeMessageId: number | null;
  nextOpportunityOffset?: number | null;
};
