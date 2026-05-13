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
  CallLiveTranscriptPlacement,
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
import { showOpportunityDiscoveryStartedToast } from "./opportunityDiscoveryToast";
import type { FetchWithAuth } from "./useCareerApi";
import {
  hasTalentOnboardingCompletionMarker,
  stripTalentOnboardingCompletionMarker,
  TALENT_ONBOARDING_DONE_MARKER,
} from "@/lib/talentOnboarding/completion";

const DEFAULT_CALL_OPENING_TEXT =
  "안녕하세요, 직접 통화로 이야기하게 되어 좋네요. 최근에 달라진 우선순위가 있으면 거기서 시작해도 좋고, 아니면 지금까지의 역할이나 경험 중 회사들이 꼭 알아야 할 부분부터 편하게 들려주세요. 정보가 많을수록 더 잘 맞는 연결 요청이나 기회를 골라드릴 수 있어요.";
const CALL_OPENING_RESPONSE_INSTRUCTION = [
  "통화가 방금 시작되었습니다. 사용자가 먼저 할 말을 찾지 않아도 되도록 Harper가 먼저 대화를 시작하세요.",
  "도구는 사용하지 마세요. 지금은 통화 시작 인사와 첫 질문만 합니다.",
  "한국어 존댓말로, 실제 전화 첫마디처럼 자연스럽게 말하세요.",
  "1-3문장으로 짧게 말하고, 마지막은 사용자가 바로 답할 수 있는 하나의 질문으로 끝내세요.",
  "최근 대화나 활동 맥락이 보이면 구체적으로 연결하세요. 예를 들어 최근 연결 제안을 거절했거나 추천에 피드백을 남겼다면, 그 이후 달라진 점이 있는지 물어보세요.",
  "구체적 맥락이 약하면 최근에 달라진 우선순위, 현재 역할/경험 중 더 알려줄 부분, 개인적인 선호나 제약 중 하나를 물어보세요.",
  "많은 정보를 들려줄수록 회사 연결 요청이나 맞춤 기회 추천이 더 정확해진다는 취지를 한 번만 짧게 말하고, 함께 헤드헌터의 입장에서 할만한 질문을 던져도 됩니다.",
  "만약 직전의 대화가 5분, 10분 이내로 최근이라면, ~~를 얘기했었는데 이어서 할까요? 정도로만 말해도 됩니다.",
].join("\n");
const ASSISTANT_BUFFER_FLUSH_TIMEOUT_MS = 1_000;
const USER_TRANSCRIPTION_TIMEOUT_MS = 5_000;
type SendChatArgs = {
  channel?: "chat" | "voice";
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
  onTalentInsightsRefreshed?: (insights: unknown, updatedAt: unknown) => void;
  appendMessage: (message: CareerMessage) => void;
  setChatError: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CareerStage>>;
  enqueueAssistantTypewriter: (message: CareerMessage) => Promise<void>;
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
};

type EndCallModeOptions = {
  forceCompleteOnboarding?: boolean;
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
  onTalentInsightsRefreshed,
  appendMessage,
  setChatError,
  setStage,
  enqueueAssistantTypewriter,
  onMessagesChanged,
}: UseCareerOnboardingVoiceArgs) => {
  const [showVoiceStartPrompt, setShowVoiceStartPrompt] = useState(false);
  const [onboardingBeginPending, setOnboardingBeginPending] = useState(false);
  const [onboardingWrapupPending, setOnboardingWrapupPending] = useState(false);
  const [onboardingPausePending, setOnboardingPausePending] = useState(false);
  const [callStartPending, setCallStartPending] = useState(false);
  const [liveUserTranscriptPlacement, setLiveUserTranscriptPlacement] =
    useState<CallLiveTranscriptPlacement>("beforeCurrentAssistant");

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
    rendered?: boolean;
    text: string;
  } | null>(null);
  const pendingAssistantDeltaTextRef = useRef("");
  const assistantBufferFlushTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const suppressNextAssistantDoneRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const clearVoiceBufferRef = useRef<(() => void) | null>(null);

  const updateSessionInstructionsRef = useRef<
    ((instructions: string) => void) | null
  >(null);
  const endCallModeRef = useRef<
    ((options?: EndCallModeOptions) => void) | null
  >(null);
  const forceEndCallModeRef = useRef<(() => void) | null>(null);
  const pendingCallEndRef = useRef(false);
  const isAssistantSpeakingRef = useRef(false);
  const callStartedAtRef = useRef<number | null>(null);
  const callWrapUpPendingRef = useRef(false);
  const liveUserTranscriptPlacementRef = useRef<CallLiveTranscriptPlacement>(
    "beforeCurrentAssistant"
  );
  const userSpeechObservedRef = useRef(false);
  const userTranscriptionPendingRef = useRef(false);
  const userSpeechWithoutTranscriptRef = useRef(false);
  const userTranscriptionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const clearUserTranscriptionTimeout = useCallback(() => {
    if (userTranscriptionTimeoutRef.current) {
      clearTimeout(userTranscriptionTimeoutRef.current);
      userTranscriptionTimeoutRef.current = null;
    }
  }, []);

  const clearAssistantBufferFlushTimeout = useCallback(() => {
    if (assistantBufferFlushTimeoutRef.current) {
      clearTimeout(assistantBufferFlushTimeoutRef.current);
      assistantBufferFlushTimeoutRef.current = null;
    }
  }, []);

  const markUserTranscriptUnavailable = useCallback(
    (options?: { forceSpeech?: boolean }) => {
      clearUserTranscriptionTimeout();
      clearAssistantBufferFlushTimeout();
      if (
        options?.forceSpeech ||
        userSpeechObservedRef.current ||
        userTranscriptionPendingRef.current
      ) {
        userSpeechWithoutTranscriptRef.current = true;
      }
      userSpeechObservedRef.current = false;
      userTranscriptionPendingRef.current = false;
      liveUserTranscriptPlacementRef.current = "beforeCurrentAssistant";
      setLiveUserTranscriptPlacement("beforeCurrentAssistant");
      clearVoiceBufferRef.current?.();

      const pendingAssistantDelta = pendingAssistantDeltaTextRef.current;
      pendingAssistantDeltaTextRef.current = "";
      if (pendingAssistantDelta) {
        appendCallAssistantTranscriptDeltaRef.current?.(pendingAssistantDelta);
      }

      const pendingAssistant = pendingAssistantDoneRef.current;
      if (pendingAssistant && !pendingAssistant.rendered) {
        finalizeCallAssistantTranscriptRef.current?.(pendingAssistant.text);
        pendingAssistantDoneRef.current = {
          ...pendingAssistant,
          rendered: true,
        };
      }
      if (
        pendingAssistant?.hasEndMarker ||
        pendingAssistant?.hasOnboardingDoneMarker
      ) {
        pendingCallEndRef.current = true;
        if (!isAssistantSpeakingRef.current) {
          pendingCallEndRef.current = false;
          endCallModeRef.current?.();
        }
      }
    },
    [clearAssistantBufferFlushTimeout, clearUserTranscriptionTimeout]
  );

  const queueAssistantBufferFlush = useCallback(() => {
    if (assistantBufferFlushTimeoutRef.current) return;
    assistantBufferFlushTimeoutRef.current = setTimeout(() => {
      assistantBufferFlushTimeoutRef.current = null;
      markUserTranscriptUnavailable({ forceSpeech: true });
    }, ASSISTANT_BUFFER_FLUSH_TIMEOUT_MS);
  }, [markUserTranscriptUnavailable]);

  const clearRealtimeTurnSyncState = useCallback(
    (options?: { resetPlacement?: boolean }) => {
      clearUserTranscriptionTimeout();
      clearAssistantBufferFlushTimeout();
      userSpeechObservedRef.current = false;
      userTranscriptionPendingRef.current = false;
      userSpeechWithoutTranscriptRef.current = false;
      if (options?.resetPlacement ?? true) {
        liveUserTranscriptPlacementRef.current = "beforeCurrentAssistant";
        setLiveUserTranscriptPlacement("beforeCurrentAssistant");
      }
    },
    [clearAssistantBufferFlushTimeout, clearUserTranscriptionTimeout]
  );

  const markUserTranscriptionPending = useCallback(
    (options?: { resetTimeout?: boolean }) => {
      if (inputModeRef.current !== "call") return;
      if (options?.resetTimeout) {
        clearUserTranscriptionTimeout();
      }
      userTranscriptionPendingRef.current = true;
      if (userTranscriptionTimeoutRef.current) return;
      userTranscriptionTimeoutRef.current = setTimeout(
        markUserTranscriptUnavailable,
        USER_TRANSCRIPTION_TIMEOUT_MS
      );
    },
    [clearUserTranscriptionTimeout, markUserTranscriptUnavailable]
  );

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
        const showWrapupPending = Boolean(args.assistantEndedOnboarding);
        if (showWrapupPending) {
          setOnboardingWrapupPending(true);
        }
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
            const assistantMessages = Array.isArray(payload?.assistantMessages)
              ? payload.assistantMessages
              : [payload?.assistantMessage].filter(Boolean);
            const savedMessages = [
              payload?.userMessage,
              ...assistantMessages,
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
          if (response.ok && payload?.opportunityDiscoveryQueued) {
            showOpportunityDiscoveryStartedToast();
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
        } finally {
          if (showWrapupPending) {
            setOnboardingWrapupPending(false);
          }
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

  const primeCallAudioPlayback = useCallback(() => {
    realtimeSessionRef.current?.primePlayback?.();
  }, []);

  const addCallTranscriptEntryRef = useRef<
    | ((
        role: "user" | "assistant",
        text: string,
        options?: {
          beforeCurrentAssistant?: boolean;
          placement?: CallLiveTranscriptPlacement;
        }
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
  const generateSpeechRef = useRef<((text: string) => void) | null>(null);
  const generateSpeechFromInstructionsRef = useRef<
    ((instructions: string) => void) | null
  >(null);
  const realtimeSessionRef = useRef<ReturnType<
    typeof useRealtimeSession
  > | null>(null);

  const handleRealtimeTranscript = useCallback(
    (text: string) => {
      const userText = text.trim();
      if (!userText) {
        markUserTranscriptUnavailable();
        return;
      }

      clearRealtimeTurnSyncState({ resetPlacement: false });

      const previousUserText = lastRealtimeUserTextRef.current;
      const combinedUserText = previousUserText
        ? `${previousUserText}\n${userText}`
        : userText;
      lastRealtimeUserTextRef.current = combinedUserText;
      const pendingAssistant = pendingAssistantDoneRef.current;
      const placement = liveUserTranscriptPlacementRef.current;
      addCallTranscriptEntryRef.current?.("user", userText, {
        beforeCurrentAssistant:
          placement === "beforeCurrentAssistant" && Boolean(pendingAssistant),
        placement,
      });

      const pendingAssistantDelta = pendingAssistantDeltaTextRef.current;
      pendingAssistantDeltaTextRef.current = "";
      if (pendingAssistantDelta) {
        appendCallAssistantTranscriptDeltaRef.current?.(pendingAssistantDelta);
      }
      clearVoiceBufferRef.current?.();
      liveUserTranscriptPlacementRef.current = "beforeCurrentAssistant";
      setLiveUserTranscriptPlacement("beforeCurrentAssistant");

      if (!pendingAssistant || inputModeRef.current !== "call") return;

      pendingAssistantDoneRef.current = null;
      if (!pendingAssistant.rendered) {
        finalizeCallAssistantTranscriptRef.current?.(pendingAssistant.text);
      }
      void saveRealtimeTurn({
        userText: combinedUserText,
        assistantText: pendingAssistant.text,
        assistantEndedOnboarding: pendingAssistant.hasOnboardingDoneMarker,
        isCallMode: true,
      });
      lastRealtimeUserTextRef.current = "";

      if (
        pendingAssistant.hasEndMarker ||
        pendingAssistant.hasOnboardingDoneMarker
      ) {
        pendingCallEndRef.current = true;
        if (!isAssistantSpeakingRef.current) {
          pendingCallEndRef.current = false;
          endCallModeRef.current?.();
        }
      }
    },
    [
      clearRealtimeTurnSyncState,
      markUserTranscriptUnavailable,
      saveRealtimeTurn,
    ]
  );

  const handleRealtimeAssistantDelta = useCallback(
    (delta: string) => {
      if (inputModeRef.current !== "call") return;
      const cleanDelta = delta
        .replaceAll("##END##", "")
        .replaceAll(TALENT_ONBOARDING_DONE_MARKER, "");
      if (!cleanDelta) return;

      if (
        !lastRealtimeUserTextRef.current &&
        !suppressNextAssistantDoneRef.current
      ) {
        const hasUnresolvedUserSpeech =
          userSpeechObservedRef.current ||
          userTranscriptionPendingRef.current ||
          userSpeechWithoutTranscriptRef.current;

        if (hasUnresolvedUserSpeech) {
          if (
            userSpeechObservedRef.current ||
            userTranscriptionPendingRef.current
          ) {
            liveUserTranscriptPlacementRef.current = "beforeCurrentAssistant";
            setLiveUserTranscriptPlacement("beforeCurrentAssistant");
            markUserTranscriptionPending();
          }
          appendCallAssistantTranscriptDeltaRef.current?.(cleanDelta);
          return;
        }

        pendingAssistantDeltaTextRef.current += cleanDelta;
        queueAssistantBufferFlush();
        return;
      }

      appendCallAssistantTranscriptDeltaRef.current?.(cleanDelta);
    },
    [markUserTranscriptionPending, queueAssistantBufferFlush]
  );

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

          const hasUnresolvedUserSpeech =
            userSpeechObservedRef.current ||
            userTranscriptionPendingRef.current ||
            userSpeechWithoutTranscriptRef.current;
          let renderedAssistant = false;
          if (hasUnresolvedUserSpeech) {
            if (
              userSpeechObservedRef.current ||
              userTranscriptionPendingRef.current
            ) {
              markUserTranscriptionPending();
            }
            finalizeCallAssistantTranscriptRef.current?.(cleanText);
            renderedAssistant = true;
          }

          if (userSpeechWithoutTranscriptRef.current) {
            userSpeechWithoutTranscriptRef.current = false;
            userSpeechObservedRef.current = false;
            userTranscriptionPendingRef.current = false;
            liveUserTranscriptPlacementRef.current = "beforeCurrentAssistant";
            setLiveUserTranscriptPlacement("beforeCurrentAssistant");

            if (hasEndMarker || hasOnboardingDoneMarker) {
              pendingCallEndRef.current = true;
              if (!isAssistantSpeakingRef.current) {
                pendingCallEndRef.current = false;
                endCallModeRef.current?.();
              }
            }
            return;
          }

          pendingAssistantDoneRef.current = {
            hasEndMarker,
            hasOnboardingDoneMarker,
            rendered: renderedAssistant,
            text: cleanText,
          };
          if (!renderedAssistant) {
            queueAssistantBufferFlush();
          }
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

        // AI signaled end of interview — wait for audio then end call.
        // The onboarding-done marker also means the live interview is finished.
        if (hasEndMarker || hasOnboardingDoneMarker) {
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
    [
      appendMessage,
      markUserTranscriptionPending,
      onMessagesChanged,
      queueAssistantBufferFlush,
      saveRealtimeTurn,
    ]
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
    clearUserTranscriptionTimeout();
    clearAssistantBufferFlushTimeout();
    userSpeechObservedRef.current = true;
    userTranscriptionPendingRef.current = false;
    userSpeechWithoutTranscriptRef.current = false;
    liveUserTranscriptPlacementRef.current = "afterCurrentAssistant";
    setLiveUserTranscriptPlacement("afterCurrentAssistant");

    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    suppressNextAssistantDoneRef.current = false;
    pendingCallEndRef.current = false;
    clearVoiceBufferRef.current?.();
  }, [clearAssistantBufferFlushTimeout, clearUserTranscriptionTimeout]);

  const handleRealtimeUserSpeechStopped = useCallback(() => {
    if (inputModeRef.current !== "call") return;
    if (
      !userSpeechObservedRef.current &&
      !userTranscriptionPendingRef.current
    ) {
      return;
    }
    markUserTranscriptionPending({ resetTimeout: true });
  }, [markUserTranscriptionPending]);

  const realtimeSession = useRealtimeSession({
    conversationId,
    fetchWithAuth,
    onTranscript: handleRealtimeTranscript,
    onAssistantDelta: handleRealtimeAssistantDelta,
    onAssistantDone: handleRealtimeAssistantDone,
    onError: handleRealtimeError,
    onConnectionChange: handleRealtimeConnectionChange,
    onUserSpeechStarted: handleRealtimeUserSpeechStarted,
    onUserSpeechStopped: handleRealtimeUserSpeechStopped,
  });
  realtimeSessionRef.current = realtimeSession;
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
    generateSpeechRef.current = realtimeSession.generateSpeech;
  }, [realtimeSession.generateSpeech]);

  useEffect(() => {
    generateSpeechFromInstructionsRef.current =
      realtimeSession.generateSpeechFromInstructions;
  }, [realtimeSession.generateSpeechFromInstructions]);

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
        clearRealtimeTurnSyncState();

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
          const openingText = customOpeningText?.trim();

          if (openingText) {
            suppressNextAssistantDoneRef.current = true;
            generateSpeechRef.current?.(openingText);
          } else if (generateSpeechFromInstructionsRef.current) {
            suppressNextAssistantDoneRef.current = true;
            generateSpeechFromInstructionsRef.current(
              CALL_OPENING_RESPONSE_INSTRUCTION
            );
          } else {
            suppressNextAssistantDoneRef.current = true;
            generateSpeechRef.current?.(DEFAULT_CALL_OPENING_TEXT);
          }
          return true;
        }

        const greetingText =
          "안녕하세요, 직접 통화로 이야기하게 되어 좋네요. 제가 먼저 하나씩 여쭤볼게요. 편하게 답해주시면 더 잘 맞는 기회를 찾는 데 도움이 됩니다.";
        const followUpText = openingAssistantMessage?.content.trim();
        const openingText = followUpText
          ? `${greetingText}\n\n${followUpText}`
          : greetingText;

        suppressNextAssistantDoneRef.current = true;
        generateSpeechRef.current?.(openingText);
        return true;
      } finally {
        setCallStartPending(false);
      }
    },
    [
      beginOnboardingConversation,
      callStartPending,
      clearRealtimeTurnSyncState,
      onboardingBeginPending,
      showVoiceStartPrompt,
      startCallMode,
    ]
  );

  // Ends the call and turns the in-call transcript into one visible follow-up
  // chat message so the user has a clear next step after the phone UI closes.
  const handleEndCallMode = useCallback(
    (options?: EndCallModeOptions) => {
      if (callWrapUpPendingRef.current) return;
      const forceCompleteOnboarding = Boolean(options?.forceCompleteOnboarding);

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
      clearRealtimeTurnSyncState();
      endCallMode();

      if (!conversationId) {
        return;
      }

      const hasUserSpeech = transcript.some(
        (entry) => entry.role === "user" && entry.text.trim().length > 0
      );
      if (!hasUserSpeech && !forceCompleteOnboarding) {
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
              forceCompleteOnboarding,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            console.error("[CareerOnboardingVoice] Follow-up failed:", payload);
            setChatError("종료 메시지 생성에 실패했습니다.");
            return;
          }

          if (payload?.progress?.completed) {
            setStage("completed" as CareerStage);
          }
          if (payload?.opportunityRun) {
            onOpportunityRunChanged?.(
              payload.opportunityRun as CareerOpportunityRun
            );
          }
          if (payload?.opportunityDiscoveryQueued) {
            showOpportunityDiscoveryStartedToast();
          }
          if (
            payload &&
            typeof payload === "object" &&
            "talentInsights" in payload
          ) {
            onTalentInsightsRefreshed?.(
              payload.talentInsights,
              payload.insightUpdatedAt ?? null
            );
          }

          const followUpMessages = Array.isArray(payload?.followUpMessages)
            ? payload.followUpMessages
            : payload?.followUpMessage
              ? [payload.followUpMessage]
              : [];

          const savedFollowUpMessages: CareerMessagePayload[] = [];
          for (const followMsg of followUpMessages) {
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
              savedFollowUpMessages.push({
                id: numericId,
                role,
                content,
                messageType,
                createdAt,
              });
            }
          }
          if (savedFollowUpMessages.length > 0) {
            await onMessagesChanged?.(savedFollowUpMessages);
          }
        } catch (error) {
          console.error("[CareerOnboardingVoice] Follow-up error:", error);
          setChatError("종료 메시지 생성에 실패했습니다.");
        } finally {
          setOnboardingBeginPending(false);
          callWrapUpPendingRef.current = false;
        }
      })();
    },
    [
      callTranscriptEntries,
      clearRealtimeTurnSyncState,
      conversationId,
      endCallMode,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      onMessagesChanged,
      onOpportunityRunChanged,
      onTalentInsightsRefreshed,
      setChatError,
      setStage,
    ]
  );

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
    setOnboardingWrapupPending(false);
    setOnboardingPausePending(false);
    setCallStartPending(false);
    callStartedAtRef.current = null;
    callWrapUpPendingRef.current = false;
    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    suppressNextAssistantDoneRef.current = false;
    lastRealtimeUserTextRef.current = "";
    clearRealtimeTurnSyncState();
  }, [clearRealtimeTurnSyncState]);

  return {
    showVoiceStartPrompt,
    onboardingBeginPending,
    onboardingWrapupPending,
    callStartPending,
    onboardingPausePending,
    inputMode,
    voiceTranscript,
    liveUserTranscriptPlacement,
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
    isAssistantSpeaking: realtimeSession.isAssistantSpeaking,
  };
};
