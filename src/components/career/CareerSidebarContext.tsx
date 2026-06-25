import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityFeedback,
  CareerHistoryOpportunityPageFilter,
  CareerCallStartRequest,
  CareerInternalOpportunityCallRequest,
  CareerMessagePayload,
  CareerOpportunitySavedStage,
  CareerRecentOpportunity,
  CareerStage,
  CareerTalentInsights,
  CareerTalentPreferences,
  CareerTalentProfile,
  CareerOpportunityRun,
  CareerOpportunityAgentVariant,
} from "./types";
import type { CareerProfileVisibility } from "@/hooks/career/useCareerTalentSettings";
import type { RunOpportunityDiscoveryTestOptions } from "@/hooks/career/useCareerRuntimeActions";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import type { TalentCompanyWatchlistItem } from "@/lib/career/companyWatchlist";

export type CareerCompanyFollowActionResult = {
  assistantMessage?: CareerMessagePayload | null;
  changed?: boolean;
  followUp?: {
    companyDbId?: number | null;
    delayed?: boolean;
  } | null;
  item?: TalentCompanyWatchlistItem | null;
  ok?: boolean;
  userMessage?: CareerMessagePayload | null;
};

export type CareerCompanyRecommendationResult = {
  answerDraft?: string;
  cacheHit?: boolean;
  candidateCount?: number;
  ok?: boolean;
  recommendedCount?: number;
  recommendations?: TalentCompanyWatchlistItem[];
};

export type CareerSidebarContextValue = {
  user: User | null;
  conversationId: string | null;
  stage: CareerStage;
  isOnboardingDone: boolean;
  workspaceDataLoading: boolean;
  userChatCount: number;
  answeredCount: number;
  targetQuestions: number;
  progressPercent: number;
  onOpenSettings: () => void;
  onLogout: () => void | Promise<void>;
  activeCompanyRoleCount: number;
  opportunityRun: CareerOpportunityRun | null;
  opportunityRunTriggerPending: boolean;
  onboardingCompletionTestPending: boolean;
  sessionReengagementTestPending: boolean;
  currentDataJobPostingRecommendationTestPending: boolean;
  onRunOnboardingCompletionTest: () => boolean | Promise<boolean>;
  onRunCurrentDataJobPostingRecommendationTest: () => void | Promise<void>;
  onRunSessionReengagementTest: (options?: {
    deleteLatestMessage?: boolean;
  }) => boolean | void | Promise<boolean | void>;
  onRunPeriodicOpportunityDiscoveryTest: (
    agentVariant?: CareerOpportunityAgentVariant,
    options?: RunOpportunityDiscoveryTestOptions
  ) =>
    | CareerOpportunityRun
    | null
    | void
    | Promise<CareerOpportunityRun | null | void>;
  onRunOpportunityDiscoveryTest: (
    agentVariant?: CareerOpportunityAgentVariant,
    options?: RunOpportunityDiscoveryTestOptions
  ) =>
    | CareerOpportunityRun
    | null
    | void
    | Promise<CareerOpportunityRun | null | void>;
  callStartPending?: boolean;
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onUseChatOnly?: () => void | Promise<void>;
  onStartConversationStarter?: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | Promise<boolean>;
  onRequestMoreOpenPositions?: () => boolean | Promise<boolean>;
  recentOpportunities: CareerRecentOpportunity[];
  pendingInternalOpportunityCallRequest?: CareerInternalOpportunityCallRequest | null;
  pendingInternalOpportunityCallRequests?: CareerInternalOpportunityCallRequest[];
  historyOpportunityCounts: CareerHistoryOpportunityCounts;
  historyOpportunities: CareerHistoryOpportunity[];
  historyLoading: boolean;
  historyLoadingMore: boolean;
  hasMoreHistoryOpportunities: boolean;
  historyUpdatingOpportunityIds: string[];
  historyUpdateError: string;
  onLoadMoreHistoryOpportunities: (
    filter?: CareerHistoryOpportunityPageFilter
  ) => void | Promise<void>;
  onLoadHistoryOpportunityByRoleId: (
    roleId: string
  ) =>
    | CareerHistoryOpportunity
    | null
    | Promise<CareerHistoryOpportunity | null>;
  onUpdateHistoryOpportunityFeedback: (
    opportunityId: string,
    feedback: CareerHistoryOpportunityFeedback | null,
    options?: {
      feedbackReason?: string | null;
      fallbackOpportunity?: CareerHistoryOpportunity;
      interactionSource?: "position_tab";
      promptImmediately?: boolean;
      savedStage?: CareerOpportunitySavedStage | null;
    }
  ) => void | Promise<void>;
  onUpdateHistoryOpportunitySavedStage: (
    opportunityId: string,
    savedStage: CareerOpportunitySavedStage
  ) => void | Promise<void>;
  onUpdateHistoryOpportunityTalentMemo: (
    opportunityId: string,
    talentMemo: string | null
  ) => void | Promise<void>;
  onMarkHistoryOpportunityViewed: (
    opportunityId: string
  ) => void | Promise<void>;
  onMarkHistoryOpportunityClicked: (
    opportunityId: string
  ) => void | Promise<void>;
  onUpdateCompanyFollow: (args: {
    action: "follow" | "unfollow";
    companyDbId: number;
    companyWorkspaceId?: string | null;
    source?: string | null;
  }) => Promise<CareerCompanyFollowActionResult | null>;
  onGenerateCompanyRecommendations: (args?: {
    forceRefresh?: boolean;
    limit?: number;
    request?: string | null;
  }) => Promise<CareerCompanyRecommendationResult | null>;

  resumeFile: File | null;
  savedResumeFileName: string | null;
  savedResumeStoragePath: string | null;
  savedResumeDownloadUrl: string | null;
  profileLinks: string[];
  savedProfileLinks: string[];
  profileSavePending: boolean;
  profileSaveError: string;
  profileSaveInfo: string;
  onResumeFileChange: (file: File | null) => void;
  onProfileLinkChange: (index: number, value: string) => void;
  onAddProfileLink: () => void;
  onRemoveProfileLink: (index: number) => void;
  onSaveTalentProfile: (args?: {
    structuredProfile?: CareerTalentProfile | null;
  }) => boolean | Promise<boolean>;
  onRefreshTalentProfileSources: (args?: {
    links?: string[];
  }) => boolean | Promise<boolean>;
  talentProfile: CareerTalentProfile;
  talentPreferences: CareerTalentPreferences | null;
  talentInsights: CareerTalentInsights | null;
  talentPreferencesUpdatedAt: string | null;
  talentPreferencesSavePending: boolean;
  talentPreferencesSaveError: string;
  talentPreferencesSaveInfo: string;
  hasUnsavedTalentPreferencesChanges: boolean;
  onResetTalentPreferences: () => void;
  talentInsightsUpdatedAt: string | null;
  talentInsightsSavePending: boolean;
  talentInsightsSaveError: string;
  talentInsightsSaveInfo: string;
  hasUnsavedTalentInsightsChanges: boolean;
  onResetTalentInsights: () => void;
  onTalentPreferencesChange: (
    next:
      | CareerTalentPreferences
      | null
      | ((
          current: CareerTalentPreferences | null
        ) => CareerTalentPreferences | null)
  ) => void;
  onSaveTalentPreferences: () => boolean | Promise<boolean>;
  onTalentInsightsChange: (
    next:
      | CareerTalentInsights
      | null
      | ((current: CareerTalentInsights | null) => CareerTalentInsights | null)
  ) => void;
  onSaveTalentInsights: () => boolean | Promise<boolean>;

  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string;
  settingsUpdatedAt: string | null;
  profileVisibility: CareerProfileVisibility;
  blockedCompanies: string[];
  hasUnsavedTalentSettingsChanges: boolean;
  onProfileVisibilityChange: (
    value: CareerProfileVisibility
  ) => boolean | Promise<boolean>;
  onAddBlockedCompany: (name: string) => boolean | Promise<boolean>;
  onRemoveBlockedCompany: (name: string) => boolean | Promise<boolean>;
  onSaveTalentSettings: () => boolean | Promise<boolean>;
  onResetTalentSettings: () => void;
  onReloadTalentSettings: () => void | Promise<void>;
};

const CareerSidebarContext = createContext<CareerSidebarContextValue | null>(
  null
);

export const CareerSidebarProvider = ({
  value,
  children,
}: {
  value: CareerSidebarContextValue;
  children: React.ReactNode;
}) => (
  <CareerSidebarContext.Provider value={value}>
    {children}
  </CareerSidebarContext.Provider>
);

export const useCareerSidebarContext = () => {
  const context = useContext(CareerSidebarContext);
  if (!context) {
    throw new Error(
      "useCareerSidebarContext must be used inside CareerSidebarProvider"
    );
  }
  return context;
};
