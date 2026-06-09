import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CallLiveTranscriptPlacement,
  CallTranscriptEntry,
  CareerInputMode,
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerInterviewProgress,
  CareerMessage,
  CareerOpportunityRun,
  CareerOpportunitySavedStage,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "./types";
import type { TalentOnboardingInterestOptionId } from "@/lib/talentOnboarding/onboarding";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";

export type CareerChatPanelContextValue = {
  user: User | null;
  conversationId: string | null;
  stage: CareerStage;
  messages: CareerMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;

  authLoading: boolean;
  authPending: boolean;
  authError: string;
  authInfo: string;

  sessionPending: boolean;
  sessionError: string;
  isOnboardingDone: boolean;

  resumeFile: File | null;
  profileLinks: string[];
  profilePending: boolean;
  profileError: string;

  chatError: string;
  assistantTyping: boolean;
  toolStatusMessage: string;
  activeThinkingLogs: string[];
  activeRecommendationSearchStatus: CareerRecommendationSearchStatus | null;
  onboardingWrapupPending: boolean;
  thinkingLogsByMessageId: Record<string, string[]>;
  chatPending: boolean;
  sessionReengagementPending: boolean;
  sessionReengagementThinkingLogs: string[];
  sessionReengagementRecommendationStatus: CareerRecommendationSearchStatus | null;
  sessionReengagementActionMessageId?: string | null;
  opportunityRun: CareerOpportunityRun | null;
  opportunitySearchLocked: boolean;
  historyUpdatingOpportunityIds: string[];
  onboardingBeginPending: boolean;
  callStartPending?: boolean;
  callWrapUpPending?: boolean;
  onboardingPausePending: boolean;

  onGoogleLogin: () => void | Promise<void>;
  onEmailAuth: (args: {
    mode: "signin" | "signup";
    email: string;
    password: string;
  }) => boolean | Promise<boolean>;

  onResumeFileChange: (file: File | null) => void;
  onProfileLinkChange: (index: number, value: string) => void;
  onRemoveProfileLink: (index: number) => void;
  onAddProfileLink: () => void;
  onProfileSubmit: () => void | Promise<void>;

  onSendChatMessage: (args: {
    allowedToolNames?: readonly string[];
    channel?: "chat" | "voice";
    conversationStarterId?: CareerConversationStarterId;
    text: string;
    link?: string;
    onError?: () => void;
  }) => void | Promise<void>;
  onStartConversationStarter?: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | Promise<boolean>;
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
  onLoadOlderMessages: () => void | Promise<void>;
  onRegenerateOnboardingWrapup?: () => void | Promise<void>;
  forceCompletePending?: boolean;
  interviewProgress: CareerInterviewProgress;
  onForceCompleteOnboarding?: () => boolean | Promise<boolean>;

  showVoiceStartPrompt: boolean;
  onStartVoiceCall: (durationMinutes?: 5 | 10) => void;
  onUseChatOnly: () => void;
  onPauseOnboarding: () => void | Promise<void>;
  onSubmitOnboardingInterest: (
    selectedOptions: TalentOnboardingInterestOptionId[]
  ) => boolean | Promise<boolean>;
  onContinueOnboardingConversation: () => void | Promise<void>;
  inputMode: CareerInputMode;
  voiceTranscript: string;
  voiceListening: boolean;
  voiceMuted: boolean;
  voiceError: string;
  assistantAudioBusy: boolean;
  voicePrimaryPressed: boolean;
  onVoicePrimaryAction: () => void;
  onToggleVoiceMute: () => void;
  onSwitchToTextMode: () => void;

  // Call mode (optional — not provided by preview.tsx)
  onStartCallMode?: (openingText?: string) => boolean | Promise<boolean>;
  onEndCallMode?: (options?: { forceCompleteOnboarding?: boolean }) => void;
  callTranscriptEntries?: CallTranscriptEntry[];
  liveUserTranscriptPlacement?: CallLiveTranscriptPlacement;
  callConnectionStatus?: "connected" | "reconnecting" | "disconnected";
  isAssistantSpeaking?: boolean;
};

const CareerChatPanelContext =
  createContext<CareerChatPanelContextValue | null>(null);

export const CareerChatPanelProvider = ({
  value,
  children,
}: {
  value: CareerChatPanelContextValue;
  children: React.ReactNode;
}) => (
  <CareerChatPanelContext.Provider value={value}>
    {children}
  </CareerChatPanelContext.Provider>
);

export const useCareerChatPanelContext = () => {
  const context = useContext(CareerChatPanelContext);
  if (!context) {
    throw new Error(
      "useCareerChatPanelContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};
