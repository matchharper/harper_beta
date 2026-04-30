import {
  useCallback,
  useEffect,
  useMemo,
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
  CareerOpportunityRun,
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
import { USE_ELEVENLABS_TTS } from "@/lib/careerVoiceConfig";
import {
  hasTalentOnboardingCompletionMarker,
  stripTalentOnboardingCompletionMarker,
  TALENT_ONBOARDING_DONE_MARKER,
} from "@/lib/talentOnboarding/completion";

const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQQAAAAAAA==";
const DEFAULT_CALL_OPENING_TEXT =
  "좋아요, 이제 통화로 이어서 이야기해볼게요. 편하게 말씀해 주세요.";

type SendChatArgs = {
  text: string;
  link?: string;
  onError?: () => void;
};

type BeginOnboardingResult = {
  ok: boolean;
  assistantMessage: CareerMessage | null;
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
  onOpportunityRunChanged?: (run: CareerOpportunityRun | null) => void;
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
  onOpportunityRunChanged,
  appendMessage,
  setChatError,
  setStage,
  enqueueAssistantTypewriter,
  onMessagesChanged,
}: UseCareerOnboardingVoiceArgs) => {
  const [showVoiceStartPrompt, setShowVoiceStartPrompt] = useState(false);
  const [onboardingBeginPending, setOnboardingBeginPending] = useState(false);
  const [onboardingPausePending, setOnboardingPausePending] = useState(false);
  const [callStartPending, setCallStartPending] = useState(false);
  const [isElevenLabsPlaying, setIsElevenLabsPlaying] = useState(false);
  const elevenLabsAudioRef = useRef<HTMLAudioElement | null>(null);
  const elevenLabsAudioPrimedRef = useRef(false);
  const elevenLabsTtsAbortRef = useRef<AbortController | null>(null);
  const elevenLabsPlaybackIdRef = useRef(0);

  const beginOnboardingConversation = useCallback(
    async (options?: {
      skipTypewriter?: boolean;
    }): Promise<BeginOnboardingResult> => {
      if (!user || !conversationId) {
        return { ok: false, assistantMessage: null };
      }
      if (onboardingBeginPending) {
        return { ok: false, assistantMessage: null };
      }

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

        const assistantMessage = payload?.assistantMessage
          ? toUiMessage(payload.assistantMessage)
          : null;

        if (assistantMessage && !options?.skipTypewriter) {
          await enqueueAssistantTypewriter(assistantMessage);
          await onMessagesChanged?.([
            payload.assistantMessage as CareerMessagePayload,
          ]);
        }
        if (payload?.conversation?.stage) {
          setStage(payload.conversation.stage as CareerStage);
        }
        return { ok: true, assistantMessage };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "대화 시작 준비 중 오류가 발생했습니다.";
        setChatError(message);
        return { ok: false, assistantMessage: null };
      } finally {
        setOnboardingBeginPending(false);
      }
    },
    [
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      onboardingBeginPending,
      onMessagesChanged,
      setChatError,
      setStage,
      user,
    ]
  );

  // Track the last user transcript from Realtime STT for turn-by-turn save
  const lastRealtimeUserTextRef = useRef("");
  const pendingAssistantDoneRef = useRef<{
    hasEndMarker: boolean;
    hasOnboardingDoneMarker: boolean;
    text: string;
  } | null>(null);
  const pendingAssistantDeltaTextRef = useRef("");
  const suppressNextAssistantDoneRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const clearVoiceBufferRef = useRef<(() => void) | null>(null);

  const updateSessionInstructionsRef = useRef<
    ((instructions: string) => void) | null
  >(null);
  const endCallModeRef = useRef<(() => void) | null>(null);
  const forceEndCallModeRef = useRef<(() => void) | null>(null);
  const pendingCallEndRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);
  const callStartedAtRef = useRef<number | null>(null);
  const callWrapUpPendingRef = useRef(false);

  const saveRealtimeTurn = useCallback(
    (args: {
      assistantEndedOnboarding?: boolean;
      userText: string;
      assistantText: string;
      isCallMode: boolean;
    }) => {
      const userText = args.userText.trim();
      const assistantText = args.assistantText.trim();
      if (!conversationId || !userText || !assistantText) {
        return Promise.resolve();
      }

      const runSave = async () => {
        try {
          const response = await fetchWithAuth("/api/talent/chat/save", {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              userMessage: userText,
              assistantMessage: assistantText,
              assistantEndedOnboarding: Boolean(args.assistantEndedOnboarding),
              isCallMode: args.isCallMode,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (response.ok) {
            const savedMessages = [
              payload?.userMessage,
              payload?.assistantMessage,
            ].filter(Boolean) as CareerMessagePayload[];

            if (savedMessages.length > 0) {
              for (const message of savedMessages) {
                appendMessage(toUiMessage(message));
              }
              void onMessagesChanged?.(savedMessages);
            }
          }
          if (response.ok && payload?.progress?.completed) {
            setStage("completed" as CareerStage);
            if (args.isCallMode && !pendingCallEndRef.current) {
              pendingCallEndRef.current = true;
              generateSpeechRef.current?.(
                "좋은 이야기 들려주셔서 감사합니다. 말씀해주신 내용을 바탕으로 잘 맞는 기회를 찾아볼게요. 오늘 대화는 여기까지 할게요."
              );
            }
          }
          if (response.ok && payload?.opportunityRun) {
            onOpportunityRunChanged?.(
              payload.opportunityRun as CareerOpportunityRun
            );
          }
          if (response.ok && payload?.searchStatusMessage) {
            appendMessage(toUiMessage(payload.searchStatusMessage));
          }
          if (response.ok && payload?.shouldEndCall) {
            forceEndCallModeRef.current?.();
          }
          if (response.ok && payload?.nextStepInstructions) {
            updateSessionInstructionsRef.current?.(
              payload.nextStepInstructions
            );
          }
        } catch (err) {
          console.error("[CareerOnboardingVoice] Save turn failed:", err);
        }
      };

      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(runSave);
      saveQueueRef.current = queuedSave.then(
        () => undefined,
        () => undefined
      );
      return queuedSave;
    },
    [
      appendMessage,
      conversationId,
      fetchWithAuth,
      onMessagesChanged,
      onOpportunityRunChanged,
      setStage,
    ]
  );

  const stopElevenLabsTts = useCallback(() => {
    elevenLabsPlaybackIdRef.current += 1;
    elevenLabsTtsAbortRef.current?.abort();
    elevenLabsTtsAbortRef.current = null;

    const audio = elevenLabsAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onplay = null;
      audio.pause();
      if (audio.src.startsWith("blob:")) {
        URL.revokeObjectURL(audio.src);
        audio.removeAttribute("src");
        audio.load();
        elevenLabsAudioRef.current = null;
      } else if (audio.src === SILENT_WAV_DATA_URI) {
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1;
      } else {
        audio.removeAttribute("src");
        audio.load();
        elevenLabsAudioRef.current = null;
      }
    }

    setIsElevenLabsPlaying(false);
  }, []);

  const playElevenLabsTts = useCallback(
    async (text: string) => {
      stopElevenLabsTts();

      const playbackId = elevenLabsPlaybackIdRef.current + 1;
      elevenLabsPlaybackIdRef.current = playbackId;
      const abortController = new AbortController();
      elevenLabsTtsAbortRef.current = abortController;

      const audio = new Audio();
      elevenLabsAudioRef.current = audio;

      setIsElevenLabsPlaying(true);
      const ttsStartTime = performance.now();
      try {
        const ttsRes = await fetchWithAuthRef.current("/api/tts", {
          method: "POST",
          body: JSON.stringify({ text }),
          signal: abortController.signal,
        });

        if (elevenLabsPlaybackIdRef.current !== playbackId) return;

        if (ttsRes.ok) {
          const fetchDone = performance.now();
          console.log(
            `[TTFT] ElevenLabs fetch: ${(fetchDone - ttsStartTime).toFixed(0)}ms`
          );
          const blob = await ttsRes.blob();
          if (elevenLabsPlaybackIdRef.current !== playbackId) return;

          const url = URL.createObjectURL(blob);
          audio.src = url;
          audio.muted = false;
          audio.volume = 1;
          audio.preload = "auto";
          audio.onplay = () => {
            if (elevenLabsPlaybackIdRef.current !== playbackId) return;
            const totalTtft = performance.now() - ttsStartTime;
            console.log(
              `[TTFT] ElevenLabs total (fetch+decode+play): ${totalTtft.toFixed(0)}ms`
            );
          };
          audio.onended = () => {
            if (elevenLabsPlaybackIdRef.current !== playbackId) return;
            setIsElevenLabsPlaying(false);
            URL.revokeObjectURL(url);
            if (elevenLabsAudioRef.current === audio) {
              audio.removeAttribute("src");
              audio.load();
            }
          };
          audio.onerror = () => {
            if (elevenLabsPlaybackIdRef.current !== playbackId) return;
            console.error("[CareerOnboardingVoice] ElevenLabs playback error");
            setIsElevenLabsPlaying(false);
            URL.revokeObjectURL(url);
            if (elevenLabsAudioRef.current === audio) {
              audio.removeAttribute("src");
              audio.load();
            }
          };
          await audio.play();
        } else {
          const errorText = await ttsRes.text().catch(() => "");
          console.error(
            "[CareerOnboardingVoice] ElevenLabs TTS request failed",
            {
              status: ttsRes.status,
              error: errorText,
            }
          );
          if (elevenLabsPlaybackIdRef.current === playbackId) {
            setIsElevenLabsPlaying(false);
          }
        }
      } catch (error) {
        if (abortController.signal.aborted) return;
        console.error(
          "[CareerOnboardingVoice] ElevenLabs TTS playback failed",
          {
            error: error instanceof Error ? error.message : "unknown",
          }
        );
        if (elevenLabsPlaybackIdRef.current === playbackId) {
          setIsElevenLabsPlaying(false);
        }
      } finally {
        if (elevenLabsTtsAbortRef.current === abortController) {
          elevenLabsTtsAbortRef.current = null;
        }
      }
    },
    [stopElevenLabsTts]
  );

  const primeCallAudioPlayback = useCallback(() => {
    if (!USE_ELEVENLABS_TTS) {
      realtimeSessionRef.current?.primePlayback?.();
      return;
    }

    if (typeof window === "undefined") return;
    if (elevenLabsAudioRef.current && elevenLabsAudioPrimedRef.current) return;

    const audio = elevenLabsAudioRef.current ?? new Audio();
    audio.onended = null;
    audio.onerror = null;
    audio.onplay = null;
    audio.src = SILENT_WAV_DATA_URI;
    audio.preload = "auto";
    audio.muted = true;
    audio.volume = 0;
    elevenLabsAudioRef.current = audio;

    void audio
      .play()
      .then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1;
        elevenLabsAudioPrimedRef.current = true;
      })
      .catch((error) => {
        console.warn("[CareerOnboardingVoice] Audio playback unlock failed", {
          error: error instanceof Error ? error.message : "unknown",
        });
        elevenLabsAudioPrimedRef.current = false;
      });
  }, []);

  const addCallTranscriptEntryRef = useRef<
    | ((
        role: "user" | "assistant",
        text: string,
        options?: { beforeCurrentAssistant?: boolean }
      ) => void)
    | null
  >(null);
  const appendCallAssistantTranscriptDeltaRef = useRef<
    ((delta: string) => void) | null
  >(null);
  const finalizeCallAssistantTranscriptRef = useRef<
    ((text: string) => void) | null
  >(null);
  const inputModeRef = useRef<string>("text");
  const fetchWithAuthRef = useRef(fetchWithAuth);
  const generateSpeechRef = useRef<((text: string) => void) | null>(null);
  const realtimeSessionRef = useRef<ReturnType<
    typeof useRealtimeSession
  > | null>(null);

  const handleRealtimeTranscript = useCallback(
    (text: string) => {
      const userText = text.trim();
      if (!userText) return;

      const previousUserText = lastRealtimeUserTextRef.current;
      const combinedUserText = previousUserText
        ? `${previousUserText}\n${userText}`
        : userText;
      lastRealtimeUserTextRef.current = combinedUserText;
      const pendingAssistant = pendingAssistantDoneRef.current;
      addCallTranscriptEntryRef.current?.("user", userText, {
        beforeCurrentAssistant: Boolean(pendingAssistant),
      });

      const pendingAssistantDelta = pendingAssistantDeltaTextRef.current;
      pendingAssistantDeltaTextRef.current = "";
      if (pendingAssistantDelta) {
        appendCallAssistantTranscriptDeltaRef.current?.(pendingAssistantDelta);
      }
      clearVoiceBufferRef.current?.();

      if (!pendingAssistant || inputModeRef.current !== "call") return;

      pendingAssistantDoneRef.current = null;
      finalizeCallAssistantTranscriptRef.current?.(pendingAssistant.text);
      void saveRealtimeTurn({
        userText: combinedUserText,
        assistantText: pendingAssistant.text,
        assistantEndedOnboarding: pendingAssistant.hasOnboardingDoneMarker,
        isCallMode: true,
      });
      lastRealtimeUserTextRef.current = "";

      if (USE_ELEVENLABS_TTS) {
        void playElevenLabsTts(pendingAssistant.text);
      }

      if (pendingAssistant.hasEndMarker) {
        pendingCallEndRef.current = true;
        if (!isAssistantSpeakingRef.current) {
          pendingCallEndRef.current = false;
          endCallModeRef.current?.();
        }
      }
    },
    [playElevenLabsTts, saveRealtimeTurn]
  );

  const handleRealtimeAssistantDelta = useCallback((delta: string) => {
    if (inputModeRef.current !== "call") return;
    const cleanDelta = delta
      .replaceAll("##END##", "")
      .replaceAll(TALENT_ONBOARDING_DONE_MARKER, "");
    if (!cleanDelta) return;

    // Normal user turns can stream Harper text before Realtime gives us the
    // final user transcript. Buffer that text so CC keeps user -> Harper order.
    if (
      !lastRealtimeUserTextRef.current &&
      !suppressNextAssistantDoneRef.current
    ) {
      pendingAssistantDeltaTextRef.current += cleanDelta;
      return;
    }

    appendCallAssistantTranscriptDeltaRef.current?.(cleanDelta);
  }, []);

  const handleRealtimeAssistantDone = useCallback(
    (fullText: string) => {
      if (!fullText.trim()) return;

      const CALL_END_MARKER = "##END##";
      const hasEndMarker = fullText.includes(CALL_END_MARKER);
      const hasOnboardingDoneMarker =
        hasTalentOnboardingCompletionMarker(fullText);
      const cleanText = stripTalentOnboardingCompletionMarker(
        fullText.replaceAll(CALL_END_MARKER, "")
      );

      const now = new Date().toISOString();
      const userText = lastRealtimeUserTextRef.current;
      const isCallMode = inputModeRef.current === "call";

      // System-initiated response (e.g., greeting) — skip UI append in call mode.
      // For normal user turns, Realtime may finish the assistant response before
      // the final user transcript arrives, so buffer it for handleRealtimeTranscript.
      if (!userText) {
        if (isCallMode) {
          if (suppressNextAssistantDoneRef.current) {
            finalizeCallAssistantTranscriptRef.current?.(cleanText);
            suppressNextAssistantDoneRef.current = false;
            return;
          }
          pendingAssistantDoneRef.current = {
            hasEndMarker,
            hasOnboardingDoneMarker,
            text: cleanText,
          };
          return;
        }

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
        finalizeCallAssistantTranscriptRef.current?.(cleanText);
        clearVoiceBufferRef.current?.();
        void saveRealtimeTurn({
          userText,
          assistantText: cleanText,
          assistantEndedOnboarding: hasOnboardingDoneMarker,
          isCallMode: true,
        });
        lastRealtimeUserTextRef.current = "";

        // ElevenLabs TTS playback when enabled
        if (USE_ELEVENLABS_TTS) {
          void playElevenLabsTts(cleanText);
        }

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
        content: cleanText,
        messageType: "chat",
        createdAt: now,
      };
      appendMessage(assistantMsg);
      void onMessagesChanged?.([
        userMsg as unknown as CareerMessagePayload,
        assistantMsg as unknown as CareerMessagePayload,
      ]);

      clearVoiceBufferRef.current?.();
      void saveRealtimeTurn({
        userText,
        assistantText: cleanText,
        assistantEndedOnboarding: hasOnboardingDoneMarker,
        isCallMode: false,
      });
      lastRealtimeUserTextRef.current = "";
    },
    [appendMessage, onMessagesChanged, playElevenLabsTts, saveRealtimeTurn]
  );

  const handleRealtimeError = useCallback(
    (error: string) => {
      console.error("[CareerOnboardingVoice] Realtime error:", error);
      setChatError(error);
    },
    [setChatError]
  );

  const handleRealtimeConnectionChange = useCallback((connected: boolean) => {
    if (!connected) {
      console.log(
        "[CareerOnboardingVoice] Realtime disconnected, fallback available"
      );
    }
  }, []);

  const handleRealtimeUserSpeechStarted = useCallback(() => {
    const hadAssistantActivity =
      isAssistantSpeakingRef.current ||
      Boolean(pendingAssistantDoneRef.current) ||
      pendingAssistantDeltaTextRef.current.length > 0 ||
      suppressNextAssistantDoneRef.current;

    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    suppressNextAssistantDoneRef.current = false;
    pendingCallEndRef.current = false;
    if (hadAssistantActivity) {
      stopElevenLabsTts();
    }
    clearVoiceBufferRef.current?.();
  }, [stopElevenLabsTts]);

  const realtimeSession = useRealtimeSession({
    conversationId,
    enabled: Boolean(user && conversationId),
    useElevenLabsTts: USE_ELEVENLABS_TTS,
    fetchWithAuth,
    onTranscript: handleRealtimeTranscript,
    onAssistantDelta: handleRealtimeAssistantDelta,
    onAssistantDone: handleRealtimeAssistantDone,
    onError: handleRealtimeError,
    onConnectionChange: handleRealtimeConnectionChange,
    onUserSpeechStarted: handleRealtimeUserSpeechStarted,
  });
  realtimeSessionRef.current = realtimeSession;
  const sendRealtimeEvent = realtimeSession.sendEvent;
  const sendRealtimeVoiceTextMessage = useCallback(
    (text: string) => {
      const normalized = text.trim();
      if (!normalized) return;

      lastRealtimeUserTextRef.current = lastRealtimeUserTextRef.current
        ? `${lastRealtimeUserTextRef.current}\n${normalized}`
        : normalized;
      realtimeSession.sendTextMessage(normalized);
    },
    [realtimeSession]
  );
  const realtimeVoiceControls = useMemo(
    () => ({
      ...realtimeSession,
      sendTextMessage: sendRealtimeVoiceTextMessage,
    }),
    [realtimeSession, sendRealtimeVoiceTextMessage]
  );

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
    appendCallAssistantTranscriptDelta,
    finalizeCallAssistantTranscript,
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
    realtimeControls: realtimeVoiceControls,
  });

  // Wire refs for use in Realtime callbacks defined before useCareerVoiceInput
  useEffect(() => {
    clearVoiceBufferRef.current = clearVoiceBuffer;
  }, [clearVoiceBuffer]);

  useEffect(() => {
    addCallTranscriptEntryRef.current = addCallTranscriptEntry;
  }, [addCallTranscriptEntry]);

  useEffect(() => {
    appendCallAssistantTranscriptDeltaRef.current =
      appendCallAssistantTranscriptDelta;
  }, [appendCallAssistantTranscriptDelta]);

  useEffect(() => {
    finalizeCallAssistantTranscriptRef.current =
      finalizeCallAssistantTranscript;
  }, [finalizeCallAssistantTranscript]);

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
    forceEndCallModeRef.current = endCallMode;
  }, [endCallMode]);

  useEffect(() => {
    updateSessionInstructionsRef.current =
      realtimeSession.updateSessionInstructions;
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

  const handleStartVoiceCall = useCallback(
    (_: 5 | 10 = 5) => {
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
        const beginResult = await beginOnboardingConversation();
        if (!beginResult.ok) {
          clearAutoResumeAfterAssistant();
          setShowVoiceStartPrompt(true);
        }
      })();
    },
    [
      armAutoResumeAfterAssistant,
      beginOnboardingConversation,
      clearAutoResumeAfterAssistant,
      onboardingBeginPending,
      showVoiceStartPrompt,
      startVoiceCall,
    ]
  );

  const handleUseChatOnly = useCallback(() => {
    if (onboardingBeginPending) return;
    if (!showVoiceStartPrompt) {
      switchToChatOnly();
      return;
    }

    setShowVoiceStartPrompt(false);
    void (async () => {
      const beginResult = await beginOnboardingConversation();
      if (!beginResult.ok) {
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
          await enqueueAssistantTypewriter(
            toUiMessage(payload.assistantMessage)
          );
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
          await enqueueAssistantTypewriter(
            toUiMessage(payload.assistantMessage)
          );
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
          error instanceof Error
            ? error.message
            : "선택 저장 중 오류가 발생했습니다.";
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

  // Starts the full-screen call flow: prepare onboarding if needed, connect
  // Realtime audio, then play the opening line once the call screen is live.
  const handleStartCallMode = useCallback(
    async (customOpeningText?: string) => {
      if (onboardingBeginPending || callStartPending) return false;

      setCallStartPending(true);
      try {
        pendingAssistantDoneRef.current = null;
        pendingAssistantDeltaTextRef.current = "";
        suppressNextAssistantDoneRef.current = false;
        lastRealtimeUserTextRef.current = "";

        const shouldBeginOnboarding =
          !customOpeningText && showVoiceStartPrompt;
        let openingAssistantMessage: CareerMessage | null = null;
        if (shouldBeginOnboarding) {
          setShowVoiceStartPrompt(false);
          const beginResult = await beginOnboardingConversation({
            skipTypewriter: true,
          });
          if (!beginResult.ok) {
            setShowVoiceStartPrompt(true);
            return false;
          }
          openingAssistantMessage = beginResult.assistantMessage;
        }

        const callStarted = await startCallMode();
        if (!callStarted) {
          if (shouldBeginOnboarding) {
            setShowVoiceStartPrompt(true);
          }
          return false;
        }

        callStartedAtRef.current = Date.now();

        if (!shouldBeginOnboarding) {
          const openingText =
            customOpeningText?.trim() || DEFAULT_CALL_OPENING_TEXT;

          if (USE_ELEVENLABS_TTS) {
            addCallTranscriptEntryRef.current?.("assistant", openingText);
            void playElevenLabsTts(openingText);
            sendRealtimeEvent({
              type: "conversation.item.create",
              item: {
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: openingText }],
              },
            });
          } else {
            suppressNextAssistantDoneRef.current = true;
            generateSpeechRef.current?.(openingText);
          }
          return true;
        }

        const greetingText =
          "안녕하세요, 하퍼입니다. 오늘 커리어에 대해 이야기 나눠볼게요. 편하게 말씀해 주세요!";
        const followUpText = openingAssistantMessage?.content.trim();
        const openingText = followUpText
          ? `${greetingText}\n\n${followUpText}`
          : greetingText;

        if (USE_ELEVENLABS_TTS) {
          addCallTranscriptEntryRef.current?.("assistant", openingText);
          void playElevenLabsTts(openingText);
          sendRealtimeEvent({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: openingText }],
            },
          });
        } else {
          suppressNextAssistantDoneRef.current = true;
          generateSpeechRef.current?.(openingText);
        }
        return true;
      } finally {
        setCallStartPending(false);
      }
    },
    [
      beginOnboardingConversation,
      callStartPending,
      onboardingBeginPending,
      playElevenLabsTts,
      sendRealtimeEvent,
      showVoiceStartPrompt,
      startCallMode,
    ]
  );

  // Ends the call and turns the in-call transcript into one visible follow-up
  // chat message so the user has a clear next step after the phone UI closes.
  const handleEndCallMode = useCallback(() => {
    if (callWrapUpPendingRef.current) return;

    stopElevenLabsTts();
    // Capture transcript before ending (endCallMode doesn't clear it)
    const transcript = callTranscriptEntries;
    const startedAt = callStartedAtRef.current;
    const durationSeconds = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      : 0;
    callStartedAtRef.current = null;
    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    suppressNextAssistantDoneRef.current = false;
    lastRealtimeUserTextRef.current = "";
    endCallMode();

    if (!conversationId) {
      return;
    }

    callWrapUpPendingRef.current = true;
    // Lock composer while generating follow-up so user can't send messages before it
    setOnboardingBeginPending(true);

    void (async () => {
      try {
        await saveQueueRef.current.catch(() => undefined);

        const response = await fetchWithAuth("/api/talent/chat/call-wrapup", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            transcript: transcript.map((e) => ({
              role: e.role,
              text: e.text,
            })),
            durationSeconds,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error("[CareerOnboardingVoice] Follow-up failed:", payload);
          setChatError("종료 메시지 생성에 실패했습니다.");
          return;
        }

        if (payload?.followUpMessage) {
          const followMsg = payload.followUpMessage;
          const id = followMsg.id ?? `followup-${Date.now()}`;
          const role = followMsg.role === "user" ? "user" : "assistant";
          const content = String(followMsg.content ?? "");
          const messageType =
            followMsg.message_type ?? followMsg.messageType ?? "chat";
          const createdAt =
            followMsg.created_at ??
            followMsg.createdAt ??
            new Date().toISOString();

          await enqueueAssistantTypewriter({
            id,
            role,
            content,
            messageType,
            createdAt,
          });

          const numericId = typeof id === "number" ? id : Number(id);
          if (Number.isFinite(numericId)) {
            await onMessagesChanged?.([
              {
                id: numericId,
                role,
                content,
                messageType,
                createdAt,
              },
            ]);
          }
        }
      } catch (error) {
        console.error("[CareerOnboardingVoice] Follow-up error:", error);
        setChatError("종료 메시지 생성에 실패했습니다.");
      } finally {
        setOnboardingBeginPending(false);
        callWrapUpPendingRef.current = false;
      }
    })();
  }, [
    callTranscriptEntries,
    conversationId,
    endCallMode,
    enqueueAssistantTypewriter,
    fetchWithAuth,
    onMessagesChanged,
    setChatError,
    stopElevenLabsTts,
  ]);

  // Wire endCallModeRef for auto-end on interview completion
  useEffect(() => {
    endCallModeRef.current = handleEndCallMode;
  }, [handleEndCallMode]);

  // Track isAssistantSpeaking in ref for use in callbacks
  useEffect(() => {
    isAssistantSpeakingRef.current =
      realtimeSession.isAssistantSpeaking || isElevenLabsPlaying;
  }, [realtimeSession.isAssistantSpeaking, isElevenLabsPlaying]);

  // Auto-end call after AI finishes speaking when interview is completed
  useEffect(() => {
    const isSpeaking =
      realtimeSession.isAssistantSpeaking || isElevenLabsPlaying;
    if (pendingCallEndRef.current && !isSpeaking) {
      pendingCallEndRef.current = false;
      endCallModeRef.current?.();
    }
  }, [realtimeSession.isAssistantSpeaking, isElevenLabsPlaying]);

  // Cleanup ElevenLabs audio on unmount
  useEffect(() => {
    return () => {
      stopElevenLabsTts();
    };
  }, [stopElevenLabsTts]);

  const resetOnboardingState = useCallback(() => {
    stopElevenLabsTts();
    setShowVoiceStartPrompt(false);
    setOnboardingBeginPending(false);
    setOnboardingPausePending(false);
    setCallStartPending(false);
    callStartedAtRef.current = null;
    callWrapUpPendingRef.current = false;
    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    suppressNextAssistantDoneRef.current = false;
    lastRealtimeUserTextRef.current = "";
  }, [stopElevenLabsTts]);

  return {
    showVoiceStartPrompt,
    onboardingBeginPending,
    callStartPending,
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
    primeCallAudioPlayback,
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
    isAssistantSpeaking:
      realtimeSession.isAssistantSpeaking || isElevenLabsPlaying,
  };
};
