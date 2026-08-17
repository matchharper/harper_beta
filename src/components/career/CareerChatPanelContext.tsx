import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type {
  CallLiveTranscriptPlacement,
  CallTranscriptEntry,
  CareerCallStartRequest,
  CareerInputMode,
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerInterviewProgress,
  CareerMessage,
  CareerOpportunityFeedbackFollowUpTrigger,
  CareerOpportunityRun,
  CareerOpportunitySavedStage,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "./types";
import type { TalentOnboardingInterestOptionId } from "@/lib/talentOnboarding/onboarding";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import type { TalentUserChatMessageType } from "@/lib/talentOnboarding/onboarding";

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
  onCancelActiveRecommendationSearch?: () => void;
  initialChatDraft?: string;
  initialChatDraftKey?: string;
  onboardingWrapupPending: boolean;
  thinkingLogsByMessageId: Record<string, string[]>;
  chatPending: boolean;
  sessionReengagementPending: boolean;
  sessionReengagementThinkingLogs: string[];
  sessionReengagementRecommendationStatus: CareerRecommendationSearchStatus | null;
  sessionReengagementActionMessageId?: string | null;
  opportunityFeedbackFollowUpPending: boolean;
  opportunityFeedbackFollowUpTrigger: CareerOpportunityFeedbackFollowUpTrigger | null;
  opportunityRun: CareerOpportunityRun | null;
  unlinkedOpportunityRuns?: CareerOpportunityRun[];
  opportunitySearchLocked: boolean;
  historyUpdatingOpportunityIds: string[];
  emailOnboardingToken?: string;
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
    messageType?: TalentUserChatMessageType;
    onError?: () => void;
  }) => void | Promise<void>;
  onStartConversationStarter?: (args: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => boolean | Promise<boolean>;
  onRunSessionReengagement?: () => boolean | Promise<boolean>;
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
  onLoadOlderMessages: () => void | Promise<void>;
  onRegenerateOnboardingWrapup?: () => void | Promise<void>;
  forceCompletePending?: boolean;
  interviewProgress: CareerInterviewProgress;
  onForceCompleteOnboarding?: () => boolean | Promise<boolean>;

  showVoiceStartPrompt: boolean;
  onUseChatOnly: () => void;
  onPauseOnboarding: () => void | Promise<void>;
  onSubmitOnboardingInterest: (
    selectedOptions: TalentOnboardingInterestOptionId[]
  ) => boolean | Promise<boolean>;
  onContinueOnboardingConversation: () => void | Promise<void>;
  inputMode: CareerInputMode;
  voiceTranscript: string;
  voiceMuted: boolean;
  onToggleVoiceMute: () => void;

  // Call mode (optional — not provided by preview.tsx)
  onStartCallMode?: (
    args?: CareerCallStartRequest
  ) => boolean | Promise<boolean>;
  onEndCallMode?: (options?: { forceCompleteOnboarding?: boolean }) => void;
  callTranscriptEntries?: CallTranscriptEntry[];
  liveUserTranscriptPlacement?: CallLiveTranscriptPlacement;
  callConnectionStatus?: "connected" | "reconnecting" | "disconnected";
  isAssistantSpeaking?: boolean;
  isVoiceToolExecuting?: boolean;
};

export type CareerCallContextValue = Pick<
  CareerChatPanelContextValue,
  | "callConnectionStatus"
  | "callTranscriptEntries"
  | "isAssistantSpeaking"
  | "isVoiceToolExecuting"
  | "liveUserTranscriptPlacement"
  | "onEndCallMode"
  | "onToggleVoiceMute"
  | "voiceMuted"
  | "voiceTranscript"
>;

export type CareerChatPanelCoreContextValue = Omit<
  CareerChatPanelContextValue,
  keyof CareerCallContextValue
>;

const CareerChatPanelContext =
  createContext<CareerChatPanelCoreContextValue | null>(null);
const CareerCallContext = createContext<CareerCallContextValue | null>(null);

type CareerChatPanelProviderProps =
  | {
      callValue: CareerCallContextValue;
      children: React.ReactNode;
      value: CareerChatPanelCoreContextValue;
    }
  | {
      callValue?: never;
      children: React.ReactNode;
      value: CareerChatPanelContextValue;
    };

export const CareerChatPanelProvider = ({
  callValue,
  value,
  children,
}: CareerChatPanelProviderProps) => {
  const compatibilityValue = value as CareerChatPanelContextValue;
  const resolvedCallValue = callValue ?? compatibilityValue;

  return (
    <CareerChatPanelContext.Provider value={value}>
      <CareerCallContext.Provider value={resolvedCallValue}>
        {children}
      </CareerCallContext.Provider>
    </CareerChatPanelContext.Provider>
  );
};

export const useCareerChatPanelContext = () => {
  const context = useContext(CareerChatPanelContext);
  if (!context) {
    throw new Error(
      "useCareerChatPanelContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};

export const useCareerCallContext = () => {
  const context = useContext(CareerCallContext);
  if (!context) {
    throw new Error(
      "useCareerCallContext must be used inside CareerChatPanelProvider"
    );
  }
  return context;
};
