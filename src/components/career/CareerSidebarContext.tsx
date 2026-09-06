import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityCounts,
  CareerHistoryOpportunityFeedback,
  CareerHistoryOpportunityPageFilter,
  CareerCallStartRequest,
  CareerCallNote,
  CareerInternalOpportunityCallRequest,
  CareerMessagePayload,
  CareerOpportunitySavedStage,
  CareerStage,
  CareerTalentInsights,
  CareerTalentDocument,
  CareerTalentPreferences,
  CareerTalentProfile,
  CareerOpportunityRun,
  CareerOpportunityAgentVariant,
} from "./types";
import type {
  CareerEngagementType,
  CareerProfileVisibility,
} from "@/hooks/career/useCareerTalentSettings";
import type { RunOpportunityDiscoveryTestOptions } from "@/hooks/career/useCareerRuntimeActions";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import type { TalentCompanyWatchlistItem } from "@/lib/career/companyWatchlist";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";

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
  isHistoryOpportunityPageFilterLoading: (
    filter: CareerHistoryOpportunityPageFilter
  ) => boolean;
  onLoadSavedStageHistoryOpportunityPages: (
    savedStages: CareerOpportunitySavedStage[]
  ) => void | Promise<void>;
  onLoadHistoryOpportunityByRoleId: (
    roleId: string
  ) =>
    | CareerHistoryOpportunity
    | null
    | Promise<CareerHistoryOpportunity | null>;
  onChangeInternalHistoryOpportunityDecision: (
    opportunityId: string,
    action: CareerInternalOpportunityDecisionAction,
    reason?: string | null
  ) => boolean | Promise<boolean>;
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
  ) => boolean | void | Promise<boolean | void>;
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

  resumeFile: File | null;
  savedResumeFileName: string | null;
  savedResumeStoragePath: string | null;
  savedResumeDownloadUrl: string | null;
  talentDocuments: CareerTalentDocument[];
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
    applyProfileSources?: boolean;
    links?: string[];
    persistError?: boolean;
    preserveLinkDrafts?: boolean;
    resumeFile?: File | null;
    resumeRequestToken?: string | null;
    structuredProfile?: CareerTalentProfile | null;
  }) => boolean | Promise<boolean>;
  onUploadTalentDocument: (
    file: File
  ) => CareerTalentDocument | null | Promise<CareerTalentDocument | null>;
  onUpdateTalentDocument: (
    documentId: string,
    updates: {
      fileName?: string;
      isPrimary?: boolean;
      isPublic?: boolean;
    }
  ) => boolean | Promise<boolean>;
  onDeleteTalentDocument: (documentId: string) => boolean | Promise<boolean>;
  onReadTalentCallNote: (documentId: string) => Promise<CareerCallNote>;
  onUpdateAccountProfile: (profile: {
    email: string | null;
    name: string | null;
    user_id: string;
  }) => void;
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
  onAccountSubscriptionsUpdated: (args: {
    harperEnabled: boolean;
    preferences: CareerTalentPreferences;
    preferencesUpdatedAt: string | null;
  }) => void;
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
  preferredLocale: string | null;
  profileVisibility: CareerProfileVisibility;
  engagementTypes: CareerEngagementType[];
  blockedCompanies: string[];
  hasUnsavedTalentSettingsChanges: boolean;
  onProfileVisibilityChange: (
    value: CareerProfileVisibility
  ) => boolean | Promise<boolean>;
  onEngagementTypesChange: (
    values: CareerEngagementType[]
  ) => boolean | Promise<boolean>;
  onAddBlockedCompany: (name: string) => boolean | Promise<boolean>;
  onRemoveBlockedCompany: (name: string) => boolean | Promise<boolean>;
  onSaveTalentSettings: () => boolean | Promise<boolean>;
  onResetTalentSettings: () => void;
  onReloadTalentSettings: () => void | Promise<void>;
};

export type CareerCompanyFollowContextValue = Pick<
  CareerSidebarContextValue,
  "onUpdateCompanyFollow" | "user"
>;

export type CareerHistoryContextValue = Pick<
  CareerSidebarContextValue,
  | "hasMoreHistoryOpportunities"
  | "historyLoading"
  | "historyLoadingMore"
  | "historyOpportunities"
  | "historyOpportunityCounts"
  | "historyUpdateError"
  | "historyUpdatingOpportunityIds"
  | "isHistoryOpportunityPageFilterLoading"
  | "onChangeInternalHistoryOpportunityDecision"
  | "onLoadHistoryOpportunityByRoleId"
  | "onLoadMoreHistoryOpportunities"
  | "onLoadSavedStageHistoryOpportunityPages"
  | "onMarkHistoryOpportunityClicked"
  | "onMarkHistoryOpportunityViewed"
  | "onUpdateHistoryOpportunityFeedback"
  | "onUpdateHistoryOpportunitySavedStage"
  | "onUpdateHistoryOpportunityTalentMemo"
>;

export type CareerProfileContextValue = Pick<
  CareerSidebarContextValue,
  | "blockedCompanies"
  | "engagementTypes"
  | "hasUnsavedTalentInsightsChanges"
  | "hasUnsavedTalentPreferencesChanges"
  | "hasUnsavedTalentSettingsChanges"
  | "onAddBlockedCompany"
  | "onAccountSubscriptionsUpdated"
  | "onAddProfileLink"
  | "onDeleteTalentDocument"
  | "onReadTalentCallNote"
  | "onUpdateTalentDocument"
  | "onUploadTalentDocument"
  | "onEngagementTypesChange"
  | "onProfileLinkChange"
  | "onProfileVisibilityChange"
  | "onRefreshTalentProfileSources"
  | "onReloadTalentSettings"
  | "onRemoveBlockedCompany"
  | "onRemoveProfileLink"
  | "onResetTalentInsights"
  | "onResetTalentPreferences"
  | "onResetTalentSettings"
  | "onResumeFileChange"
  | "onSaveTalentInsights"
  | "onSaveTalentPreferences"
  | "onSaveTalentProfile"
  | "onSaveTalentSettings"
  | "onTalentInsightsChange"
  | "onTalentPreferencesChange"
  | "onUpdateAccountProfile"
  | "preferredLocale"
  | "profileLinks"
  | "profileSaveError"
  | "profileSaveInfo"
  | "profileSavePending"
  | "profileVisibility"
  | "resumeFile"
  | "savedProfileLinks"
  | "savedResumeDownloadUrl"
  | "savedResumeFileName"
  | "savedResumeStoragePath"
  | "settingsError"
  | "settingsLoading"
  | "settingsSaving"
  | "settingsUpdatedAt"
  | "talentInsights"
  | "talentDocuments"
  | "talentInsightsSaveError"
  | "talentInsightsSaveInfo"
  | "talentInsightsSavePending"
  | "talentInsightsUpdatedAt"
  | "talentPreferences"
  | "talentPreferencesSaveError"
  | "talentPreferencesSaveInfo"
  | "talentPreferencesSavePending"
  | "talentPreferencesUpdatedAt"
  | "talentProfile"
  | "user"
>;

export type CareerWorkspaceContextValue = Omit<
  CareerSidebarContextValue,
  | keyof CareerCompanyFollowContextValue
  | keyof CareerHistoryContextValue
  | keyof CareerProfileContextValue
> & {
  user: CareerSidebarContextValue["user"];
};

const CareerSidebarContext = createContext<CareerWorkspaceContextValue | null>(
  null
);
const CareerCompanyFollowContext =
  createContext<CareerCompanyFollowContextValue | null>(null);
const CareerHistoryContext = createContext<CareerHistoryContextValue | null>(
  null
);
const CareerProfileContext = createContext<CareerProfileContextValue | null>(
  null
);

type CareerSidebarProviderProps =
  | {
      children: React.ReactNode;
      companyFollowValue: CareerCompanyFollowContextValue;
      historyValue: CareerHistoryContextValue;
      profileValue: CareerProfileContextValue;
      value: CareerWorkspaceContextValue;
    }
  | {
      children: React.ReactNode;
      companyFollowValue?: never;
      historyValue?: never;
      profileValue?: never;
      value: CareerSidebarContextValue;
    };

export const CareerSidebarProvider = ({
  children,
  companyFollowValue,
  historyValue,
  profileValue,
  value,
}: CareerSidebarProviderProps) => {
  const compatibilityValue = value as CareerSidebarContextValue;

  return (
    <CareerSidebarContext.Provider value={value}>
      <CareerCompanyFollowContext.Provider
        value={companyFollowValue ?? compatibilityValue}
      >
        <CareerHistoryContext.Provider
          value={historyValue ?? compatibilityValue}
        >
          <CareerProfileContext.Provider
            value={profileValue ?? compatibilityValue}
          >
            {children}
          </CareerProfileContext.Provider>
        </CareerHistoryContext.Provider>
      </CareerCompanyFollowContext.Provider>
    </CareerSidebarContext.Provider>
  );
};

export const useCareerSidebarContext = () => {
  const context = useContext(CareerSidebarContext);
  if (!context) {
    throw new Error(
      "useCareerSidebarContext must be used inside CareerSidebarProvider"
    );
  }
  return context;
};

export const useCareerCompanyFollowContext = () => {
  const context = useContext(CareerCompanyFollowContext);
  if (!context) {
    throw new Error(
      "useCareerCompanyFollowContext must be used inside CareerSidebarProvider"
    );
  }
  return context;
};

export const useCareerHistoryContext = () => {
  const context = useContext(CareerHistoryContext);
  if (!context) {
    throw new Error(
      "useCareerHistoryContext must be used inside CareerSidebarProvider"
    );
  }
  return context;
};

export const useCareerProfileContext = () => {
  const context = useContext(CareerProfileContext);
  if (!context) {
    throw new Error(
      "useCareerProfileContext must be used inside CareerSidebarProvider"
    );
  }
  return context;
};
