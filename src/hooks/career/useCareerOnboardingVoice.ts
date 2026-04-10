import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useCareerVoiceInput } from "@/components/career/useCareerVoiceInput";
import { useRealtimeSession } from "@/hooks/career/useRealtimeSession";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import type { TalentOnboardingInterestOptionId } from "@/lib/talentOnboarding/onboarding";
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
  appendMessage: (message: CareerMessage) => void;
  setChatError: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CareerStage>>;
  enqueueAssistantTypewriter: (message: CareerMessage) => Promise<void>;
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
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
  appendMessage,
  setChatError,
  setStage,
  enqueueAssistantTypewriter,
  onMessagesChanged,
}: UseCareerOnboardingVoiceArgs) => {
  const [showVoiceStartPrompt, setShowVoiceStartPrompt] = useState(false);
  const [onboardingBeginPending, setOnboardingBeginPending] = useState(false);
  const [onboardingPausePending, setOnboardingPausePending] = useState(false);

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
        await onMessagesChanged?.([
          payload.assistantMessage as CareerMessagePayload,
        ]);
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
    onMessagesChanged,
    setChatError,
    setStage,
    user,
  ]);

  // Track the last user transcript from Realtime STT for turn-by-turn save
  const lastRealtimeUserTextRef = useRef("");
  const savePendingRef = useRef(false);
  const clearVoiceBufferRef = useRef<(() => void) | null>(null);

  const saveRealtimeTurn = useCallback(
    async (userText: string, assistantText: string) => {
      if (!conversationId || savePendingRef.current) return;
      savePendingRef.current = true;
      try {
        const response = await fetchWithAuth("/api/talent/chat/save", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            userMessage: userText,
            assistantMessage: assistantText,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.progress?.completed) {
          setStage("completed" as CareerStage);
        }
      } catch (err) {
        console.error("[CareerOnboardingVoice] Save turn failed:", err);
      } finally {
        savePendingRef.current = false;
      }
    },
    [conversationId, fetchWithAuth, setStage]
  );

  const addCallTranscriptEntryRef = useRef<
    ((role: "user" | "assistant", text: string) => void) | null
  >(null);
  const inputModeRef = useRef<string>("text");
  const fetchWithAuthRef = useRef(fetchWithAuth);

  const handleRealtimeTranscript = useCallback((text: string) => {
    if (text.trim()) {
      lastRealtimeUserTextRef.current = text.trim();
      addCallTranscriptEntryRef.current?.("user", text.trim());
    }
  }, []);

  const handleRealtimeAssistantDone = useCallback(
    (fullText: string) => {
      if (!fullText.trim()) return;
      addCallTranscriptEntryRef.current?.("assistant", fullText.trim());

      const now = new Date().toISOString();
      const userText = lastRealtimeUserTextRef.current || "(voice input)";

      // Append user message to UI with Realtime transcript
      const userMsg: CareerMessage = {
        id: `rt-user-${Date.now()}`,
        role: "user",
        content: userText,
        messageType: "chat",
        createdAt: now,
      };
      appendMessage(userMsg);

      // Append assistant message to UI
      const assistantMsg: CareerMessage = {
        id: `rt-assistant-${Date.now()}`,
        role: "assistant",
        content: fullText,
        messageType: "chat",
        createdAt: now,
      };
      appendMessage(assistantMsg);
      void onMessagesChanged?.([
        userMsg as unknown as CareerMessagePayload,
        assistantMsg as unknown as CareerMessagePayload,
      ]);

      // Clear input field and save turn to DB
      clearVoiceBufferRef.current?.();
      void saveRealtimeTurn(userText, fullText);
      lastRealtimeUserTextRef.current = "";

      // Play TTS directly during call mode
      if (inputModeRef.current === "call") {
        void (async () => {
          try {
            const ttsRes = await fetchWithAuthRef.current("/api/tts", {
              method: "POST",
              body: JSON.stringify({ text: fullText }),
            });
            if (ttsRes.ok) {
              const blob = await ttsRes.blob();
              const url = URL.createObjectURL(blob);
              const audio = new Audio(url);
              audio.onended = () => URL.revokeObjectURL(url);
              await audio.play();
            }
          } catch {
            // TTS failure is non-critical during call
          }
        })();
      }
    },
    [appendMessage, onMessagesChanged, saveRealtimeTurn]
  );

  const handleRealtimeError = useCallback(
    (error: string) => {
      console.error("[CareerOnboardingVoice] Realtime error:", error);
      setChatError(error);
    },
    [setChatError]
  );

  const handleRealtimeConnectionChange = useCallback(
    (connected: boolean) => {
      if (!connected) {
        console.log("[CareerOnboardingVoice] Realtime disconnected, fallback available");
      }
    },
    []
  );

  const realtimeSession = useRealtimeSession({
    conversationId,
    enabled: Boolean(user && conversationId),
    fetchWithAuth,
    onTranscript: handleRealtimeTranscript,
    onAssistantDelta: () => {}, // Could be used for streaming UI in future
    onAssistantDone: handleRealtimeAssistantDone,
    onError: handleRealtimeError,
    onConnectionChange: handleRealtimeConnectionChange,
  });

  const {
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    voiceEngine,
    startVoiceCall,
    startCallMode,
    endCallMode,
    addCallTranscriptEntry,
    callTranscriptEntries,
    connectionStatus,
    switchToChatOnly,
    handleVoicePrimaryAction,
    toggleVoiceMute,
    switchToTextMode,
    armAutoResumeAfterAssistant,
    clearAutoResumeAfterAssistant,
    resetVoice,
    clearVoiceBuffer,
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
    realtimeControls: realtimeSession,
  });

  // Wire refs for use in Realtime callbacks defined before useCareerVoiceInput
  useEffect(() => {
    clearVoiceBufferRef.current = clearVoiceBuffer;
  }, [clearVoiceBuffer]);

  useEffect(() => {
    addCallTranscriptEntryRef.current = addCallTranscriptEntry;
  }, [addCallTranscriptEntry]);

  useEffect(() => {
    inputModeRef.current = inputMode;
  }, [inputMode]);

  useEffect(() => {
    fetchWithAuthRef.current = fetchWithAuth;
  }, [fetchWithAuth]);

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
    setOnboardingPausePending(false);
    switchToChatOnly();
  }, [switchToChatOnly]);

  const handleStartVoiceCall = useCallback((_: 5 | 10 = 5) => {
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

  const handlePauseOnboarding = useCallback(() => {
    if (!user || !conversationId || onboardingPausePending) return;

    setOnboardingPausePending(true);
    setChatError("");
    setShowVoiceStartPrompt(false);
    switchToChatOnly();

    void (async () => {
      try {
        const response = await fetchWithAuth("/api/talent/onboarding/defer", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            action: "prompt",
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "나중에 이어하기 준비에 실패했습니다.")
          );
        }

        if (payload?.assistantMessage) {
          await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));
          await onMessagesChanged?.([
            payload.assistantMessage as CareerMessagePayload,
          ]);
        }
        if (payload?.conversation?.stage) {
          setStage(payload.conversation.stage as CareerStage);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "나중에 이어하기 준비 중 오류가 발생했습니다.";
        setChatError(message);
        setShowVoiceStartPrompt(true);
      } finally {
        setOnboardingPausePending(false);
      }
    })();
  }, [
    conversationId,
    enqueueAssistantTypewriter,
    fetchWithAuth,
    onboardingPausePending,
    onMessagesChanged,
    setChatError,
    setStage,
    switchToChatOnly,
    user,
  ]);

  const handleSubmitOnboardingInterest = useCallback(
    async (selectedOptions: TalentOnboardingInterestOptionId[]) => {
      if (!user || !conversationId || onboardingPausePending) return false;

      setOnboardingPausePending(true);
      setChatError("");

      try {
        const response = await fetchWithAuth("/api/talent/onboarding/defer", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            action: "submit",
            selectedOptions,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "선택 저장에 실패했습니다.")
          );
        }

        if (payload?.userMessage) {
          appendMessage(toUiMessage(payload.userMessage));
        }
        if (payload?.assistantMessage) {
          await enqueueAssistantTypewriter(toUiMessage(payload.assistantMessage));
        }
        if (payload?.conversation?.stage) {
          setStage(payload.conversation.stage as CareerStage);
        }
        await onMessagesChanged?.(
          [payload.userMessage, payload.assistantMessage].filter(
            Boolean
          ) as CareerMessagePayload[]
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "선택 저장 중 오류가 발생했습니다.";
        setChatError(message);
        return false;
      } finally {
        setOnboardingPausePending(false);
      }
    },
    [
      appendMessage,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      onboardingPausePending,
      onMessagesChanged,
      setChatError,
      setStage,
      user,
    ]
  );

  const handleContinueOnboardingConversation = useCallback(() => {
    if (onboardingBeginPending || onboardingPausePending) return;

    switchToChatOnly();
    void beginOnboardingConversation();
  }, [
    beginOnboardingConversation,
    onboardingBeginPending,
    onboardingPausePending,
    switchToChatOnly,
  ]);

  const handleSwitchToTextMode = useCallback(() => {
    switchToTextMode();
  }, [switchToTextMode]);

  const handleToggleVoiceMute = useCallback(() => {
    toggleVoiceMute();
  }, [toggleVoiceMute]);

  const handleStartCallMode = useCallback(async () => {
    if (onboardingBeginPending) return;

    const shouldBeginOnboarding = showVoiceStartPrompt;
    if (shouldBeginOnboarding) {
      setShowVoiceStartPrompt(false);
      // AWAIT onboarding initialization before connecting realtime
      const ready = await beginOnboardingConversation();
      if (!ready) {
        setShowVoiceStartPrompt(true);
        return;
      }
    }

    await startCallMode();

    const greetingText =
      "안녕하세요, Harper입니다. 오늘 커리어에 대해 이야기 나눠볼게요. 편하게 말씀해 주세요!";

    addCallTranscriptEntry("assistant", greetingText);

    const greetingMsg: CareerMessage = {
      id: `call-greeting-${Date.now()}`,
      role: "assistant",
      content: greetingText,
      messageType: "chat",
      createdAt: new Date().toISOString(),
    };
    appendMessage(greetingMsg);

    // Play greeting TTS directly in click handler to satisfy autoplay policy
    try {
      const ttsRes = await fetchWithAuth("/api/tts", {
        method: "POST",
        body: JSON.stringify({ text: greetingText }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      }
    } catch {
      // TTS failure is non-critical
    }
  }, [
    addCallTranscriptEntry,
    appendMessage,
    beginOnboardingConversation,
    fetchWithAuth,
    onboardingBeginPending,
    showVoiceStartPrompt,
    startCallMode,
  ]);

  const handleEndCallMode = useCallback(() => {
    // Capture transcript before ending (endCallMode doesn't clear it)
    const transcript = callTranscriptEntries;
    endCallMode();

    if (conversationId && transcript.length > 0) {
      // Lock composer while generating wrap-up so user can't send messages before it
      setOnboardingBeginPending(true);

      void (async () => {
        try {
          const response = await fetchWithAuth(
            "/api/talent/chat/call-wrapup",
            {
              method: "POST",
              body: JSON.stringify({
                conversationId,
                transcript: transcript.map((e) => ({
                  role: e.role,
                  text: e.text,
                })),
                durationSeconds: 0,
              }),
            }
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            console.error("[CareerOnboardingVoice] Wrap-up failed:", payload);
            setChatError("통화 요약 생성에 실패했습니다.");
            return;
          }

          // Append wrap-up card
          if (payload?.wrapUpMessage) {
            const wrapMsg = payload.wrapUpMessage;
            appendMessage({
              id: wrapMsg.id ?? `wrapup-${Date.now()}`,
              role: "assistant",
              content: wrapMsg.content,
              messageType: wrapMsg.message_type ?? wrapMsg.messageType ?? "call_wrapup",
              createdAt: wrapMsg.created_at ?? wrapMsg.createdAt ?? new Date().toISOString(),
            });
          }

          // Append follow-up message with typewriter
          if (payload?.followUpMessage) {
            const followMsg = payload.followUpMessage;
            await enqueueAssistantTypewriter({
              id: followMsg.id ?? `followup-${Date.now()}`,
              role: "assistant",
              content: followMsg.content,
              messageType: followMsg.message_type ?? followMsg.messageType ?? "chat",
              createdAt: followMsg.created_at ?? followMsg.createdAt ?? new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error("[CareerOnboardingVoice] Wrap-up error:", error);
          setChatError("통화 요약 생성에 실패했습니다.");
        } finally {
          setOnboardingBeginPending(false);
        }
      })();
    }
  }, [
    appendMessage,
    callTranscriptEntries,
    conversationId,
    endCallMode,
    enqueueAssistantTypewriter,
    fetchWithAuth,
    setChatError,
  ]);

  const resetOnboardingState = useCallback(() => {
    setShowVoiceStartPrompt(false);
    setOnboardingBeginPending(false);
    setOnboardingPausePending(false);
  }, []);

  return {
    showVoiceStartPrompt,
    onboardingBeginPending,
    onboardingPausePending,
    inputMode,
    voiceTranscript,
    voiceListening,
    voiceMuted,
    voiceError,
    assistantAudioBusy,
    voicePrimaryPressed,
    voiceEngine,
    handleVoicePrimaryAction,
    handleToggleVoiceMute,
    handleStartVoiceCall,
    handleStartCallMode,
    handleEndCallMode,
    callTranscriptEntries,
    connectionStatus,
    handleUseChatOnly,
    handlePauseOnboarding,
    handleSubmitOnboardingInterest,
    handleContinueOnboardingConversation,
    handleSwitchToTextMode,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
  };
};
