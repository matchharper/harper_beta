import type { User } from "@supabase/supabase-js";
import React, { createContext, useContext } from "react";
import type { CareerInputMode, CareerMessage, CareerStage } from "./types";
import type { TalentOnboardingInterestOptionId } from "@/lib/talentOnboarding/onboarding";

export type CareerChatPanelContextValue = {
  user: User | null;
  conversationId: string | null;
  stage: CareerStage;
  messages: CareerMessage[];
  scrollRef: React.RefObject<HTMLDivElement>;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;

  authLoading: boolean;
  authPending: boolean;
  authError: string;
  authInfo: string;

  sessionPending: boolean;
  sessionError: string;

  resumeFile: File | null;
  profileLinks: string[];
  profilePending: boolean;
  profileError: string;

  chatError: string;
  assistantTyping: boolean;
  chatPending: boolean;
  onboardingBeginPending: boolean;
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
    text: string;
    link?: string;
    onError?: () => void;
  }) => void | Promise<void>;
  onLoadOlderMessages: () => void | Promise<void>;

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

  vapiCallStatus: "idle" | "connecting" | "active" | "ending" | "ended";
  vapiCallDuration: number;
  vapiCallError: string | null;
  onStartVapiCall: () => void;
  onEndVapiCall: () => void;
  onDismissVapiCall: () => void;
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
