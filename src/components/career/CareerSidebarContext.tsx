import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CareerNetworkApplication,
  CareerStage,
  CareerTalentPreferences,
  CareerTalentProfile,
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
  onSaveTalentProfile: () => void | Promise<void>;
  talentProfile: CareerTalentProfile;
  networkApplication: CareerNetworkApplication | null;
  talentPreferences: CareerTalentPreferences | null;
  networkApplicationSavePending: boolean;
  networkApplicationSaveError: string;
  networkApplicationSaveInfo: string;
  talentPreferencesSavePending: boolean;
  talentPreferencesSaveError: string;
  talentPreferencesSaveInfo: string;
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

  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string;
  profileVisibility: CareerProfileVisibility;
  blockedCompanies: string[];
  onProfileVisibilityChange: (value: CareerProfileVisibility) => void;
  onAddBlockedCompany: (name: string) => void;
  onRemoveBlockedCompany: (name: string) => void;
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
