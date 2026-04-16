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

  const beginOnboardingConversation = useCallback(async (options?: { skipTypewriter?: boolean }) => {
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

      if (payload?.assistantMessage && !options?.skipTypewriter) {
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

  const updateSessionInstructionsRef = useRef<((instructions: string) => void) | null>(null);
  const endCallModeRef = useRef<(() => void) | null>(null);
  const pendingCallEndRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);

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
            isCallMode: true,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.progress?.completed) {
          setStage("completed" as CareerStage);
        }
        // Handle step transition: update Realtime session instructions
        if (response.ok && payload?.nextStepInstructions) {
          updateSessionInstructionsRef.current?.(payload.nextStepInstructions);
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
  const generateSpeechRef = useRef<((text: string) => void) | null>(null);

  const handleRealtimeTranscript = useCallback((text: string) => {
    if (text.trim()) {
      lastRealtimeUserTextRef.current = text.trim();
      addCallTranscriptEntryRef.current?.("user", text.trim());
    }
  }, []);

  const handleRealtimeAssistantDone = useCallback(
    (fullText: string) => {
      if (!fullText.trim()) return;

      const CALL_END_MARKER = "##END##";
      const hasEndMarker = fullText.includes(CALL_END_MARKER);
      const cleanText = hasEndMarker
        ? fullText.replace(CALL_END_MARKER, "").trim()
        : fullText.trim();

      addCallTranscriptEntryRef.current?.("assistant", cleanText);

      const now = new Date().toISOString();
      const userText = lastRealtimeUserTextRef.current;
      const isCallMode = inputModeRef.current === "call";

      // System-initiated response (e.g., greeting) — skip UI append in call mode
      if (!userText) {
        if (!isCallMode) {
          const assistantMsg: CareerMessage = {
            id: `rt-assistant-${Date.now()}`,
            role: "assistant",
            content: cleanText,
            messageType: "chat",
            createdAt: now,
          };
          appendMessage(assistantMsg);
        }
        return;
      }

      // In call mode: save to DB only, don't show in chat timeline
      if (isCallMode) {
        clearVoiceBufferRef.current?.();
        void saveRealtimeTurn(userText, cleanText);
        lastRealtimeUserTextRef.current = "";
        // AI signaled end of interview — wait for audio then end call
        if (hasEndMarker) {
          pendingCallEndRef.current = true;
          if (!isAssistantSpeakingRef.current) {
            pendingCallEndRef.current = false;
            endCallModeRef.current?.();
          }
        }
        return;
      }

      // Non-call voice mode: append to UI as before
      const userMsg: CareerMessage = {
        id: `rt-user-${Date.now()}`,
        role: "user",
        content: userText,
        messageType: "chat",
        createdAt: now,
      };
      appendMessage(userMsg);

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

      clearVoiceBufferRef.current?.();
      void saveRealtimeTurn(userText, fullText);
      lastRealtimeUserTextRef.current = "";

      // ElevenLabs TTS playback — skipped in call mode (native Realtime audio handles it)
      if (inputModeRef.current === "call" && false) {
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
    generateSpeechRef.current = realtimeSession.generateSpeech;
  }, [realtimeSession.generateSpeech]);

  useEffect(() => {
    updateSessionInstructionsRef.current = realtimeSession.updateSessionInstructions;
  }, [realtimeSession.updateSessionInstructions]);


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
      const ready = await beginOnboardingConversation({ skipTypewriter: true });
      if (!ready) {
        setShowVoiceStartPrompt(true);
        return;
      }
    }

    await startCallMode();

    // Generate greeting via OpenAI Realtime native audio (no ElevenLabs round-trip)
    const greetingText =
      "안녕하세요, 하퍼입니다. 오늘 커리어에 대해 이야기 나눠볼게요. 편하게 말씀해 주세요!";
    generateSpeechRef.current?.(greetingText);
  }, [
    beginOnboardingConversation,
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

  // Wire endCallModeRef for auto-end on interview completion
  useEffect(() => {
    endCallModeRef.current = handleEndCallMode;
  }, [handleEndCallMode]);

  // Track isAssistantSpeaking in ref for use in callbacks
  useEffect(() => {
    isAssistantSpeakingRef.current = realtimeSession.isAssistantSpeaking;
  }, [realtimeSession.isAssistantSpeaking]);

  // Auto-end call after AI finishes speaking when interview is completed
  useEffect(() => {
    if (pendingCallEndRef.current && !realtimeSession.isAssistantSpeaking) {
      pendingCallEndRef.current = false;
      endCallModeRef.current?.();
    }
  }, [realtimeSession.isAssistantSpeaking]);

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
    isAssistantSpeaking: realtimeSession.isAssistantSpeaking,
  };
};
