import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useCareerVoiceInput } from "@/components/career/useCareerVoiceInput";
import type {
  CareerMessage,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import {
  getErrorMessage,
  shouldShowVoiceStartPrompt,
  toUiMessage,
} from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

type SendChatArgs = {
  text: string;
  link?: string;
  onError?: () => void;
};

type UseCareerOnboardingVoiceArgs = {
  user: User | null;
  userId: string | null;
  authLoading: boolean;
  conversationId: string | null;
  messages: CareerMessage[];
  fetchWithAuth: FetchWithAuth;
  isVoiceInteractionLocked: boolean;
  onSendChatMessage: (args: SendChatArgs) => void | Promise<void>;
  setChatError: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CareerStage>>;
  enqueueAssistantTypewriter: (message: CareerMessage) => Promise<void>;
};

export const useCareerOnboardingVoice = ({
  user,
  userId,
  authLoading,
  conversationId,
  messages,
  fetchWithAuth,
  isVoiceInteractionLocked,
  onSendChatMessage,
  setChatError,
  setStage,
  enqueueAssistantTypewriter,
}: UseCareerOnboardingVoiceArgs) => {
  const [showVoiceStartPrompt, setShowVoiceStartPrompt] = useState(false);
  const [onboardingBeginPending, setOnboardingBeginPending] = useState(false);

  const beginOnboardingConversation = useCallback(async () => {
    if (!user || !conversationId) return false;
    if (onboardingBeginPending) return false;

    setOnboardingBeginPending(true);
    setChatError("");
    try {
      const response = await fetchWithAuth("/api/talent/onboarding/begin", {
        method: "POST",
        body: JSON.stringify({
          conversationId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "대화 시작 준비에 실패했습니다.")
        );
      }

      if (payload?.assistantMessage) {
        await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));
      }
      if (payload?.conversation?.stage) {
        setStage(payload.conversation.stage as CareerStage);
      }
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "대화 시작 준비 중 오류가 발생했습니다.";
      setChatError(message);
      return false;
    } finally {
      setOnboardingBeginPending(false);
    }
  }, [
    conversationId,
    enqueueAssistantTypewriter,
    fetchWithAuth,
    onboardingBeginPending,
    setChatError,
    setStage,
    user,
  ]);

  const {
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceInputLevel,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    startVoiceCall,
    switchToChatOnly,
    handleVoicePrimaryAction,
    toggleVoiceMute,
    switchToTextMode,
    armAutoResumeAfterAssistant,
    clearAutoResumeAfterAssistant,
    resetVoice,
  } = useCareerVoiceInput({
    canInteract:
      !isVoiceInteractionLocked &&
      !onboardingBeginPending &&
      Boolean(user && conversationId),
    messages,
    onSendMessage: onSendChatMessage,
    onUnsupported: (message) => {
      setChatError(message);
    },
  });

  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      resetVoice();
    }
  }, [authLoading, resetVoice, userId]);

  const applySessionPrompt = useCallback((payload: SessionResponse) => {
    const loadedMessages = payload.messages.map(toUiMessage);
    setShowVoiceStartPrompt(
      shouldShowVoiceStartPrompt(payload.conversation.stage, loadedMessages)
    );
  }, []);

  const handleProfileSubmitSuccess = useCallback(() => {
    setShowVoiceStartPrompt(true);
    setOnboardingBeginPending(false);
    switchToChatOnly();
  }, [switchToChatOnly]);

  const handleStartVoiceCall = useCallback(() => {
    if (onboardingBeginPending) return;

    const shouldBeginOnboarding = showVoiceStartPrompt;
    if (shouldBeginOnboarding) {
      setShowVoiceStartPrompt(false);
      armAutoResumeAfterAssistant();
    }

    // Keep speech start inside the direct click handler to avoid
    // browser gesture-loss `not-allowed` errors.
    void startVoiceCall();

    if (!shouldBeginOnboarding) return;

    void (async () => {
      const ready = await beginOnboardingConversation();
      if (!ready) {
        clearAutoResumeAfterAssistant();
        setShowVoiceStartPrompt(true);
      }
    })();
  }, [
    armAutoResumeAfterAssistant,
    beginOnboardingConversation,
    clearAutoResumeAfterAssistant,
    onboardingBeginPending,
    showVoiceStartPrompt,
    startVoiceCall,
  ]);

  const handleUseChatOnly = useCallback(() => {
    if (onboardingBeginPending) return;
    if (!showVoiceStartPrompt) {
      switchToChatOnly();
      return;
    }

    setShowVoiceStartPrompt(false);
    void (async () => {
      const ready = await beginOnboardingConversation();
      if (!ready) {
        setShowVoiceStartPrompt(true);
        return;
      }
      switchToChatOnly();
    })();
  }, [
    beginOnboardingConversation,
    onboardingBeginPending,
    showVoiceStartPrompt,
    switchToChatOnly,
  ]);

  const handleSwitchToTextMode = useCallback(() => {
    switchToTextMode();
  }, [switchToTextMode]);

  const handleToggleVoiceMute = useCallback(() => {
    toggleVoiceMute();
  }, [toggleVoiceMute]);

  const resetOnboardingState = useCallback(() => {
    setShowVoiceStartPrompt(false);
    setOnboardingBeginPending(false);
  }, []);

  return {
    showVoiceStartPrompt,
    onboardingBeginPending,
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceInputLevel,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    handleVoicePrimaryAction,
    handleToggleVoiceMute,
    handleStartVoiceCall,
    handleUseChatOnly,
    handleSwitchToTextMode,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
  };
};
