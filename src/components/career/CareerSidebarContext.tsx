import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerNetworkApplication,
  CareerOpportunitySavedStage,
  CareerRecentOpportunity,
  CareerStage,
  CareerTalentNotification,
  CareerTalentInsights,
  CareerTalentPreferences,
  CareerTalentProfile,
  CareerOpportunityRun,
} from "./types";
import type { CareerProfileVisibility } from "@/hooks/career/useCareerTalentSettings";

export type CareerSidebarContextValue = {
  user: User | null;
  stage: CareerStage;
  userChatCount: number;
  answeredCount: number;
  targetQuestions: number;
  progressPercent: number;
  onOpenSettings: () => void;
  onLogout: () => void | Promise<void>;
  activeCompanyRoleCount: number;
  opportunityRun: CareerOpportunityRun | null;
  opportunityRunTriggerPending: boolean;
  onRunOpportunityDiscoveryTest: () => void | Promise<void>;
  recentOpportunities: CareerRecentOpportunity[];
  historyOpportunities: CareerHistoryOpportunity[];
  historyLoading: boolean;
  historyUpdatingOpportunityIds: string[];
  historyUpdateError: string;
  onUpdateHistoryOpportunityFeedback: (
    opportunityId: string,
    feedback: CareerHistoryOpportunityFeedback | null,
    options?: {
      feedbackReason?: string | null;
      savedStage?: CareerOpportunitySavedStage | null;
    }
  ) => void | Promise<void>;
  onUpdateHistoryOpportunitySavedStage: (
    opportunityId: string,
    savedStage: CareerOpportunitySavedStage
  ) => void | Promise<void>;
  onMarkHistoryOpportunityViewed: (
    opportunityId: string
  ) => void | Promise<void>;
  onMarkHistoryOpportunityClicked: (
    opportunityId: string
  ) => void | Promise<void>;
  onSendHistoryOpportunityQuestion: (
    opportunityId: string,
    question: string
  ) => boolean | Promise<boolean>;
  onPrepareMockInterview: (
    opportunityId?: string | null
  ) => void | Promise<void>;
  notifications: CareerTalentNotification[];
  unreadNotificationCount: number;
  notificationsMarkingAsRead: boolean;
  notificationsError: string;
  onMarkNotificationsRead: () => void | Promise<void>;

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
  onSaveTalentProfile: (
    args?: { structuredProfile?: CareerTalentProfile | null }
  ) => boolean | Promise<boolean>;
  talentProfile: CareerTalentProfile;
  networkApplication: CareerNetworkApplication | null;
  talentPreferences: CareerTalentPreferences | null;
  talentInsights: CareerTalentInsights | null;
  networkApplicationUpdatedAt: string | null;
  networkApplicationSavePending: boolean;
  networkApplicationSaveError: string;
  networkApplicationSaveInfo: string;
  hasUnsavedNetworkApplicationChanges: boolean;
  onResetNetworkApplication: () => void;
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
  onNetworkApplicationChange: (
    next:
      | CareerNetworkApplication
      | null
      | ((
          current: CareerNetworkApplication | null
        ) => CareerNetworkApplication | null)
  ) => void;
  onSaveNetworkApplication: () => boolean | Promise<boolean>;
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
  settingsSaveInfo: string;
  settingsUpdatedAt: string | null;
  profileVisibility: CareerProfileVisibility;
  blockedCompanies: string[];
  hasUnsavedTalentSettingsChanges: boolean;
  onProfileVisibilityChange: (value: CareerProfileVisibility) => void;
  onAddBlockedCompany: (name: string) => void;
  onRemoveBlockedCompany: (name: string) => void;
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
