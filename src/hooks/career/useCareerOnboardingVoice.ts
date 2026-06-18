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
  CareerCallStartRequest,
  CareerInterviewProgress,
  CareerInternalOpportunityCallRequest,
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
import { showToast } from "@/components/toast/toast";
import { showOpportunityDiscoveryStartedToast } from "./opportunityDiscoveryToast";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import {
  hasTalentOnboardingCompletionMarker,
  stripTalentOnboardingCompletionMarker,
  TALENT_ONBOARDING_DONE_MARKER,
} from "@/lib/talentOnboarding/completion";
import type { CareerConversationStarterId } from "@/lib/career/conversationStarters";
import { INSIGHT_CHECKLIST } from "@/lib/talentOnboarding/insightChecklist";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

type CareerT = ReturnType<typeof useCareerT>;

const DEFAULT_CALL_OPENING_TEXT =
  "통화로 이야기해볼게요. 최근에 달라진 우선순위가 있으면 거기서 시작해도 좋고, 아니면 지금까지의 역할이나 경험 중 회사들이 꼭 알아야 할 부분부터 편하게 들려주세요. 정보가 많을수록 더 잘 맞는 연결 요청이나 기회를 골라드릴 수 있어요.";

const CALL_OPENING_RESPONSE_INSTRUCTION = [
  "통화가 방금 시작되었습니다. 사용자가 먼저 할 말을 찾지 않아도 되도록 Harper가 먼저 대화를 시작하세요.",
  "도구는 사용하지 마세요. 지금은 통화 시작 멘트와 첫 질문만 합니다.",
  "한국어 존댓말로, 실제 전화 첫마디처럼 자연스럽게 말하세요.",
  "2-4문장으로 짧게 말하고, 마지막은 사용자가 바로 답할 수 있는 하나의 질문으로 끝내세요.",
  "통화는 크게 2가지 방식으로 시작할 수 있습니다. 1) 이전에 채팅으로 진행하던 대화를 통화로 이어서하는 경우, 2) 통화로 새롭게 대화를 시작하는 경우",
  "최근 채팅 맥락이 함께 제공되면 먼저 그 내용을 보고, 이전에 채팅으로 진행하던 대화를 통화로 이어서 하는 상황인지 판단하세요.",
  "이전 내용에서 이어서 말하는 게 자연스러우면 새 주제를 꺼내지 말고 마지막으로 오가던 질문이나 답변을 직접 이어받아 시작하세요. 대신 인사하고 시작하는 것이 자연스러우면 인사하고 시작하면 된다.",
  "이어가기 위해 필요하면 직전 대화의 마지막 질문이나 확인점을 짧게 다시 물어도 됩니다.",
  "(2번) 새롭게 대화를 시작하는게 자연스러우면 먼저 커피챗을 시작하는 헤드헌터처럼 말을 건네면서 시작하면 된다.",
  "최근 대화나 활동 맥락이 보이면 구체적으로 연결하세요. 예를 들어 최근 연결 제안을 거절했거나 추천에 피드백을 남겼다면, 그 이후 달라진 점이 있는지 물어보세요.",
  "구체적 맥락이 약하면 최근에 달라진 우선순위, 현재 역할/경험 중 더 알려줄 부분, 개인적인 선호나 제약 중 하나를 물어보세요.",
  "많은 정보를 들려줄수록 회사 연결 요청이나 맞춤 기회 추천이 더 정확해진다는 취지를 한 번만 짧게 말하고, 함께 헤드헌터의 입장에서 할만한 질문을 던져도 됩니다.",
].join("\n");

const ONBOARDING_CALL_OPENING_RESPONSE_INSTRUCTION = [
  "통화가 방금 시작되었습니다. 이 통화는 5분 커리어 인터뷰를 위한 통화입니다.",
  "도구는 사용하지 마세요. 지금은 통화 시작 멘트와 첫 질문만 합니다.",
  "한국어 존댓말로, 실제 전화 첫마디처럼 자연스럽게 말하세요.",
  "첫 문장에서는 이 대화가 왜 필요한지 가볍게 안내하세요. 더 잘 맞는 기회 추천과 회사 연결을 위해 현재 상황과 선호를 짧게 확인한다는 취지입니다.",
  "안내 직후 바로 질문 하나를 하세요.",
  "질문은 세션 instructions의 Onboarding Question Checklist에서 current_status가 missing인 항목 중 우선순위가 높은 항목을 고르고, 해당 항목의 question hint를 기반으로 만드세요.",
  "이미 covered인 항목이나 최근 대화에서 답한 주제는 다시 묻지 마세요.",
  "최근 대화 내역은 배경으로만 참고하고, missing checklist 항목과 question hint 기반 질문 선택을 대신하지 마세요.",
  "전체 첫 멘트는 3~4문장으로 끝내고, 마지막 문장은 사용자가 바로 답할 수 있는 질문이어야 합니다.",
  '예시: "안녕하세요. 이 5분 커리어 인터뷰는 하퍼가 더 잘 맞는 기회를 추천하고, 필요하면 회사와 연결할 때 후보자님의 맥락을 잘 전달하기 위해 짧게 확인하는 대화예요. 편하게 답해주시면 되고, 먼저 현재 탐색 온도부터 확인해볼게요. 지금 적극적으로 다음 기회를 찾고 계신 건지, 아니면 좋은 게 있으면 받아는 보고 싶다 정도인지 편하게 말씀해주세요."',
].join("\n");

function formatCallOpeningRelativeTime(
  createdAt: string,
  nowMs: number,
  t: CareerT
) {
  const createdAtMs = Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs)) return "";

  const elapsedMs = nowMs - createdAtMs;
  if (elapsedMs < 0) return "";

  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;

  if (elapsedMs < minuteMs) {
    return t("career.call.opening.relative.just_now", "방금전");
  }
  if (elapsedMs < hourMs) {
    const minutes = Math.floor(elapsedMs / minuteMs);
    if (minutes === 1) {
      return t("career.call.opening.relative.minute_one", "{count}분전", {
        values: { count: minutes },
      });
    }
    return t("career.call.opening.relative.minute_many", "{count}분전", {
      values: { count: minutes },
    });
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    if (hours === 1) {
      return t("career.call.opening.relative.hour_one", "{count}시간전", {
        values: { count: hours },
      });
    }
    return t("career.call.opening.relative.hour_many", "{count}시간전", {
      values: { count: hours },
    });
  }
  if (elapsedMs < monthMs) {
    const days = Math.floor(elapsedMs / dayMs);
    if (days === 1) {
      return t("career.call.opening.relative.day_one", "{count}일전", {
        values: { count: days },
      });
    }
    return t("career.call.opening.relative.day_many", "{count}일전", {
      values: { count: days },
    });
  }
  const months = Math.floor(elapsedMs / monthMs);
  if (months === 1) {
    return t("career.call.opening.relative.month_one", "{count}개월전", {
      values: { count: months },
    });
  }
  return t("career.call.opening.relative.month_many", "{count}개월전", {
    values: { count: months },
  });
}

function buildCallOpeningRecentConversationContext(
  messages: CareerMessage[],
  t: CareerT
) {
  const recentMessages = messages
    .filter((message) => message.content.trim() && !message.typing)
    .slice(-8);
  if (recentMessages.length === 0) return "";

  const nowMs = Date.now();
  const maxTotal = 1600;
  const maxPerMessage = 260;
  let section = t(
    "career.call.opening.recent_context.header",
    "## 최근 채팅 맥락\n"
  );
  let totalLength = section.length;

  for (const message of recentMessages) {
    const roleLabel =
      message.role === "assistant"
        ? "Harper"
        : t("career.call.opening.recent_context.user", "사용자");
    const relativeTime = formatCallOpeningRelativeTime(
      message.createdAt,
      nowMs,
      t
    );
    const label = relativeTime ? `${roleLabel}(${relativeTime})` : roleLabel;
    const normalizedContent = message.content.replace(/\s+/g, " ").trim();
    const truncatedContent =
      normalizedContent.length > maxPerMessage
        ? `${normalizedContent.slice(0, maxPerMessage)}...`
        : normalizedContent;
    const line = `- ${label}: ${truncatedContent}\n`;

    if (totalLength + line.length > maxTotal) break;
    section += line;
    totalLength += line.length;
  }

  return section.trim();
}

function buildCallOpeningResponseInstruction(args: {
  interviewProgress?: CareerInterviewProgress | null;
  isOnboardingDone?: boolean;
  isConversationStarter?: boolean;
  openingText?: string;
  recentConversationContext?: string;
  t: CareerT;
}) {
  const {
    interviewProgress,
    isConversationStarter,
    isOnboardingDone,
    openingText,
    recentConversationContext,
    t,
  } = args;
  const normalizedOpeningText = openingText?.trim();
  const shouldUseNearFinishOpening =
    !isOnboardingDone &&
    !isConversationStarter &&
    typeof interviewProgress?.percent === "number" &&
    interviewProgress.percent >= 75;
  const shouldUseOnboardingOpening =
    !isOnboardingDone && !isConversationStarter;

  const sections = [
    shouldUseOnboardingOpening
      ? t(
          "career.call.opening.instruction.onboarding",
          ONBOARDING_CALL_OPENING_RESPONSE_INSTRUCTION
        )
      : t(
          "career.call.opening.instruction.default",
          CALL_OPENING_RESPONSE_INSTRUCTION
        ),
    shouldUseNearFinishOpening &&
      t(
        "career.call.opening.instruction.near_finish",
        [
          "",
          "## Incomplete onboarding near-finish opening",
          "현재 커리어 인터뷰는 아직 완료되지 않았지만 거의 끝난 상태입니다.",
          "- filledInsights: {filledCount}/{totalCount}",
          "- remainingInsights: {remainingCount}",
          "- 일반적인 새 통화 인사나 '오늘 어떠세요?', '최근 우선순위가 바뀐 게 있나요?' 같은 넓은 질문으로 시작하지 마세요.",
          "- 첫 문장은 '대화가 거의 끝났고, 더 정확한 추천/연결을 위해 마지막 확인만 빠르게 하겠다'는 취지를 자연스럽게 담으세요.",
          "- 최근 대화 맥락은 배경으로만 참고하고, 마지막으로 남은 한 가지 missing checklist question hint나 final priority confirmation으로 바로 이어가세요.",
          "- 이미 final priority confirmation에 사용자가 답한 맥락이면 같은 확인 질문을 반복하지 말고 짧게 closing으로 넘어가세요.",
        ].join("\n"),
        {
          values: {
            filledCount: interviewProgress?.filledCount ?? "(unknown)",
            remainingCount: interviewProgress?.remainingCount ?? "(unknown)",
            totalCount: interviewProgress?.totalCount ?? "(unknown)",
          },
        }
      ),
    isConversationStarter &&
      t(
        "career.call.opening.instruction.conversation_starter",
        [
          "",
          "## Conversation starter opening",
          "이번 통화는 사용자가 특정 conversation starter 버튼을 눌러 시작했습니다.",
          "아래 starter 내용의 목적과 질문 방향을 가장 우선하세요.",
          "최근 우선순위, 선호 조건, 일반적인 기회 탐색 질문을 임의로 고르지 마세요.",
        ].join("\n")
      ),
    recentConversationContext &&
      [
        "",
        recentConversationContext,
        !shouldUseOnboardingOpening &&
          t(
            "career.call.opening.instruction.use_recent_context",
            "위 최근 채팅 맥락은 통화 첫 멘트를 정할 때 가장 먼저 참고하세요. 마지막 대화가 아직 이어지는 흐름이면 일반적인 새 인사나 새 질문으로 시작하지 마세요."
          ),
      ].join("\n"),
    normalizedOpeningText &&
      !shouldUseOnboardingOpening &&
      [
        "",
        t(
          "career.call.opening.instruction.reference_opening",
          "## 참고할 통화 시작 내용\n아래 문구나 질문의 취지를 통화 첫 멘트에 자연스럽게 반영하세요. 그대로 읽기보다 위 지시와 최근 대화 맥락에 맞게 말하세요."
        ),
        normalizedOpeningText,
      ].join("\n"),
  ].filter(Boolean);

  return sections.join("\n");
}

function logCallOpeningResponseInstruction(instructions: string) {
  if (process.env.NODE_ENV === "production") return;

  console.log("[CareerCall] opening response instructions", {
    length: instructions.length,
  });
  console.log(instructions);
}

const ASSISTANT_BUFFER_FLUSH_TIMEOUT_MS = 1_000;
const USER_TRANSCRIPTION_TIMEOUT_MS = 5_000;
type SendChatArgs = {
  channel?: "chat" | "voice";
  conversationStarterId?: CareerConversationStarterId;
  text: string;
  link?: string;
  onError?: () => void;
};

type StartCallModeArgs = CareerCallStartRequest;

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
  isOnboardingDone?: boolean;
  onSendChatMessage: (args: SendChatArgs) => void | Promise<void>;
  onOpportunityRunChanged?: (run: CareerOpportunityRun | null) => void;
  onTalentPreferencesRefreshed?: (
    preferences: unknown,
    updatedAt: unknown
  ) => void;
  onTalentInsightsRefreshed?: (insights: unknown, updatedAt: unknown) => void;
  onTalentProfileRefreshed?: (
    profile: SessionResponse["talentProfile"] | undefined
  ) => void;
  onPendingInternalOpportunityCallRequestChanged?: (
    callRequest: CareerInternalOpportunityCallRequest | null
  ) => void;
  onPendingInternalOpportunityCallRequestsChanged?: (
    callRequests: CareerInternalOpportunityCallRequest[]
  ) => void;
  appendMessage: (message: CareerMessage) => void;
  setChatError: Dispatch<SetStateAction<string>>;
  setStage: Dispatch<SetStateAction<CareerStage>>;
  talentInsights?: Record<string, string> | null;
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
  isOnboardingDone,
  onSendChatMessage,
  onOpportunityRunChanged,
  onTalentPreferencesRefreshed,
  onTalentInsightsRefreshed,
  onTalentProfileRefreshed,
  onPendingInternalOpportunityCallRequestChanged,
  onPendingInternalOpportunityCallRequestsChanged,
  appendMessage,
  setChatError,
  setStage,
  talentInsights,
  enqueueAssistantTypewriter,
  onMessagesChanged,
}: UseCareerOnboardingVoiceArgs) => {
  const t = useCareerT();
  const tCareer = useCareerMessageFormatter();
  const { locale } = useMessages();
  const [showVoiceStartPrompt, setShowVoiceStartPrompt] = useState(false);
  const [onboardingBeginPending, setOnboardingBeginPending] = useState(false);
  const [onboardingWrapupPending, setOnboardingWrapupPending] = useState(false);
  const [onboardingPausePending, setOnboardingPausePending] = useState(false);
  const [callStartPending, setCallStartPending] = useState(false);
  const [callWrapUpPending, setCallWrapUpPending] = useState(false);
  const [liveUserTranscriptPlacement, setLiveUserTranscriptPlacement] =
    useState<CallLiveTranscriptPlacement>("beforeCurrentAssistant");
  const callInterviewProgress = useMemo<CareerInterviewProgress>(() => {
    const totalCount = INSIGHT_CHECKLIST.length;
    const filledCount = INSIGHT_CHECKLIST.reduce((count, item) => {
      const value = talentInsights?.[item.key];
      return String(value ?? "").trim().length > 0 ? count + 1 : count;
    }, 0);
    const percent =
      totalCount > 0
        ? Math.min(100, Math.round((filledCount / totalCount) * 100))
        : 0;

    return {
      canForceComplete: !isOnboardingDone && percent >= 85,
      filledCount,
      percent,
      remainingCount: Math.max(totalCount - filledCount, 0),
      totalCount,
    };
  }, [isOnboardingDone, talentInsights]);

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
            locale,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.conversationStartPrepareFailed))
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
            : tCareer(H.conversationStartPrepareUnexpected);
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
      locale,
      onboardingBeginPending,
      onMessagesChanged,
      setChatError,
      setStage,
      tCareer,
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
  const activeCallConversationStarterIdRef =
    useRef<CareerConversationStarterId | null>(null);
  const activeInternalCallRequestIdRef = useRef<string | null>(null);

  const updateSessionInstructionsRef = useRef<
    ((instructions: string) => void) | null
  >(null);
  const endCallModeRef = useRef<
    ((options?: EndCallModeOptions) => void) | null
  >(null);
  const forceEndCallModeRef = useRef<(() => void) | null>(null);
  const pendingCallEndRef = useRef(false);
  const wasAssistantSpeakingRef = useRef(false);
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
  const inputModeRef = useRef<string>("text");
  const generateSpeechRef = useRef<((text: string) => void) | null>(null);
  const generateSpeechFromInstructionsRef = useRef<
    ((instructions: string) => void) | null
  >(null);
  const realtimeSessionRef = useRef<ReturnType<
    typeof useRealtimeSession
  > | null>(null);

  const scheduleCallEndAfterRealtimePlayback = useCallback(() => {
    pendingCallEndRef.current = true;

    const finishCallEnd = () => {
      if (!pendingCallEndRef.current) return;
      pendingCallEndRef.current = false;
      if (inputModeRef.current !== "call") return;
      endCallModeRef.current?.();
    };

    const runAfterPlayback =
      realtimeSessionRef.current?.runAfterCurrentPlayback;
    if (runAfterPlayback) {
      runAfterPlayback(finishCallEnd);
      return;
    }

    finishCallEnd();
  }, []);

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
        scheduleCallEndAfterRealtimePlayback();
      }
    },
    [
      clearAssistantBufferFlushTimeout,
      clearUserTranscriptionTimeout,
      scheduleCallEndAfterRealtimePlayback,
    ]
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
      userText?: string;
      assistantText?: string;
      isCallMode: boolean;
    }) => {
      const userText = args.userText?.trim() ?? "";
      const assistantText = args.assistantText?.trim() ?? "";
      if (!conversationId || (!userText && !assistantText)) {
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
              conversationStarterId:
                activeCallConversationStarterIdRef.current ?? undefined,
              internalCallRequestId:
                activeInternalCallRequestIdRef.current ?? undefined,
              userMessage: userText,
              assistantMessage: assistantText,
              assistantEndedOnboarding: Boolean(args.assistantEndedOnboarding),
              isCallMode: args.isCallMode,
              locale,
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
          if (
            response.ok &&
            payload &&
            typeof payload === "object" &&
            "talentInsights" in payload
          ) {
            onTalentInsightsRefreshed?.(
              payload.talentInsights,
              "insightUpdatedAt" in payload ? payload.insightUpdatedAt : null
            );
          }
          if (response.ok && payload?.progress?.completed) {
            setStage("completed" as CareerStage);
            if (args.isCallMode && !pendingCallEndRef.current) {
              pendingCallEndRef.current = true;
              generateSpeechRef.current?.(tCareer(H.callCompletionSpeech));
            }
          }
          if (response.ok && payload?.opportunityRun) {
            onOpportunityRunChanged?.(
              payload.opportunityRun as CareerOpportunityRun
            );
          }
          if (response.ok && payload?.opportunityDiscoveryQueued) {
            showOpportunityDiscoveryStartedToast(
              tCareer(H.opportunityDiscoveryStarted)
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
      locale,
      onMessagesChanged,
      onTalentInsightsRefreshed,
      onOpportunityRunChanged,
      setStage,
      tCareer,
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
        scheduleCallEndAfterRealtimePlayback();
      }
    },
    [
      clearRealtimeTurnSyncState,
      markUserTranscriptUnavailable,
      saveRealtimeTurn,
      scheduleCallEndAfterRealtimePlayback,
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
            void saveRealtimeTurn({
              assistantText: cleanText,
              isCallMode: true,
            });
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
              scheduleCallEndAfterRealtimePlayback();
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
          scheduleCallEndAfterRealtimePlayback();
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
      scheduleCallEndAfterRealtimePlayback,
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

  useEffect(() => {
    realtimeSessionRef.current = realtimeSession;
  }, [realtimeSession]);

  const {
    inputMode,
    voiceTranscript,
    voiceMuted,
    startCallMode,
    endCallMode,
    addCallTranscriptEntry,
    appendCallAssistantTranscriptDelta,
    finalizeCallAssistantTranscript,
    callTranscriptEntries,
    connectionStatus,
    switchToChatOnly,
    toggleVoiceMute,
    resetVoice,
    clearVoiceBuffer,
  } = useCareerVoiceInput({
    canInteract:
      !isVoiceInteractionLocked &&
      !onboardingBeginPending &&
      Boolean(user && conversationId),
    onUnsupported: (message) => {
      if (message === tCareer(H.callCompleted)) {
        showToast({ message, variant: "white" });
        return;
      }
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
    // eslint-disable-next-line react-hooks/immutability -- Ref bridge connects callbacks created before useCareerVoiceInput.
    appendCallAssistantTranscriptDeltaRef.current =
      appendCallAssistantTranscriptDelta;
  }, [appendCallAssistantTranscriptDelta]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Ref bridge connects callbacks created before useCareerVoiceInput.
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
            locale,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.onboardingDeferPrepareFailed))
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
            : tCareer(H.onboardingDeferPrepareUnexpected);
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
    locale,
    onboardingPausePending,
    onMessagesChanged,
    setChatError,
    setStage,
    switchToChatOnly,
    tCareer,
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
            locale,
            selectedOptions,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.onboardingInterestSaveFailed))
          );
        }

        if (
          payload &&
          typeof payload === "object" &&
          "talentInsights" in payload
        ) {
          onTalentInsightsRefreshed?.(
            payload.talentInsights,
            "insightUpdatedAt" in payload ? payload.insightUpdatedAt : null
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
            : tCareer(H.onboardingInterestSaveUnexpected);
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
      locale,
      onboardingPausePending,
      onMessagesChanged,
      onTalentInsightsRefreshed,
      setChatError,
      setStage,
      tCareer,
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

  const handleToggleVoiceMute = useCallback(() => {
    toggleVoiceMute();
  }, [toggleVoiceMute]);

  // Starts the full-screen call flow: prepare onboarding if needed, connect
  // Realtime audio, then play the opening line once the call screen is live.
  const handleStartCallMode = useCallback(
    async (startArgs?: StartCallModeArgs) => {
      if (onboardingBeginPending || callStartPending) return false;

      const customOpeningText =
        typeof startArgs === "string" ? startArgs : startArgs?.openingText;
      const isMockCall =
        typeof startArgs === "object" && Boolean(startArgs?.mock);
      const conversationStarterId =
        typeof startArgs === "object"
          ? (startArgs.conversationStarterId ?? null)
          : null;
      const internalCallRequestId =
        typeof startArgs === "object"
          ? (startArgs.internalCallRequestId?.trim() ?? null)
          : null;
      activeCallConversationStarterIdRef.current = isMockCall
        ? null
        : conversationStarterId;
      activeInternalCallRequestIdRef.current = isMockCall
        ? null
        : internalCallRequestId;

      setCallStartPending(true);
      let callStartedSuccessfully = false;
      try {
        pendingAssistantDoneRef.current = null;
        pendingAssistantDeltaTextRef.current = "";
        suppressNextAssistantDoneRef.current = false;
        lastRealtimeUserTextRef.current = "";
        clearRealtimeTurnSyncState();

        const shouldBeginOnboarding =
          !isMockCall && !customOpeningText && showVoiceStartPrompt;
        let openingAssistantMessage: CareerMessage | null = null;
        if (shouldBeginOnboarding) {
          setShowVoiceStartPrompt(false);
          const beginResult = await beginOnboardingConversation({
            skipTypewriter: true,
          });
          if (!beginResult.ok) {
            setShowVoiceStartPrompt(true);
            activeCallConversationStarterIdRef.current = null;
            activeInternalCallRequestIdRef.current = null;
            return false;
          }
          openingAssistantMessage = beginResult.assistantMessage;
        }

        const callStarted = await startCallMode({
          conversationStarterId: isMockCall ? null : conversationStarterId,
          internalCallRequestId: isMockCall ? null : internalCallRequestId,
          mock: isMockCall,
        });
        if (!callStarted) {
          if (shouldBeginOnboarding) {
            setShowVoiceStartPrompt(true);
          }
          activeCallConversationStarterIdRef.current = null;
          activeInternalCallRequestIdRef.current = null;
          return false;
        }

        callStartedAtRef.current = Date.now();
        callStartedSuccessfully = true;
        if (isMockCall) {
          return true;
        }

        const openingRecentConversationContext =
          buildCallOpeningRecentConversationContext(messages, t);

        if (!shouldBeginOnboarding) {
          const openingText = customOpeningText?.trim();

          suppressNextAssistantDoneRef.current = true;
          if (generateSpeechFromInstructionsRef.current) {
            const openingInstructions = buildCallOpeningResponseInstruction({
              interviewProgress: callInterviewProgress,
              isOnboardingDone,
              isConversationStarter: Boolean(conversationStarterId),
              openingText,
              recentConversationContext: openingRecentConversationContext,
              t,
            });
            logCallOpeningResponseInstruction(openingInstructions);
            generateSpeechFromInstructionsRef.current(openingInstructions);
          } else {
            generateSpeechRef.current?.(
              openingText ||
                t("career.call.opening.default_text", DEFAULT_CALL_OPENING_TEXT)
            );
          }
          return true;
        }

        const greetingText = tCareer(H.callGreeting);
        const followUpText = openingAssistantMessage?.content.trim();
        const openingText = followUpText
          ? `${greetingText}\n\n${followUpText}`
          : greetingText;

        suppressNextAssistantDoneRef.current = true;
        if (generateSpeechFromInstructionsRef.current) {
          const openingInstructions = buildCallOpeningResponseInstruction({
            interviewProgress: callInterviewProgress,
            isOnboardingDone,
            isConversationStarter: Boolean(conversationStarterId),
            openingText,
            recentConversationContext: openingRecentConversationContext,
            t,
          });
          logCallOpeningResponseInstruction(openingInstructions);
          generateSpeechFromInstructionsRef.current(openingInstructions);
        } else {
          generateSpeechRef.current?.(openingText);
        }
        return true;
      } finally {
        if (!callStartedSuccessfully) {
          activeCallConversationStarterIdRef.current = null;
          activeInternalCallRequestIdRef.current = null;
        }
        setCallStartPending(false);
      }
    },
    [
      beginOnboardingConversation,
      callStartPending,
      callInterviewProgress,
      clearRealtimeTurnSyncState,
      isOnboardingDone,
      messages,
      onboardingBeginPending,
      showVoiceStartPrompt,
      startCallMode,
      t,
      tCareer,
    ]
  );

  // Ends the call and turns the in-call transcript into one visible follow-up
  // chat message so the user has a clear next step after the phone UI closes.
  const handleEndCallMode = useCallback(
    (options?: EndCallModeOptions) => {
      setCallStartPending(false);
      pendingCallEndRef.current = false;
      if (callWrapUpPendingRef.current) return;
      const forceCompleteOnboarding = Boolean(options?.forceCompleteOnboarding);

      // Capture transcript before ending (endCallMode doesn't clear it)
      const transcript = callTranscriptEntries;
      const startedAt = callStartedAtRef.current;
      const durationSeconds = startedAt
        ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
        : 0;
      const activeCallConversationStarterId =
        activeCallConversationStarterIdRef.current;
      const activeInternalCallRequestId =
        activeInternalCallRequestIdRef.current;
      const pendingUserText = lastRealtimeUserTextRef.current.trim();
      if (pendingUserText) {
        void saveRealtimeTurn({
          userText: pendingUserText,
          isCallMode: true,
        });
      }
      callStartedAtRef.current = null;
      pendingAssistantDoneRef.current = null;
      pendingAssistantDeltaTextRef.current = "";
      suppressNextAssistantDoneRef.current = false;
      lastRealtimeUserTextRef.current = "";
      clearRealtimeTurnSyncState();
      endCallMode();

      if (!conversationId) {
        activeCallConversationStarterIdRef.current = null;
        activeInternalCallRequestIdRef.current = null;
        return;
      }

      const hasUserSpeech = transcript.some(
        (entry) => entry.role === "user" && entry.text.trim().length > 0
      );
      if (
        !hasUserSpeech &&
        !forceCompleteOnboarding &&
        !activeInternalCallRequestId
      ) {
        activeCallConversationStarterIdRef.current = null;
        activeInternalCallRequestIdRef.current = null;
        return;
      }

      callWrapUpPendingRef.current = true;
      setCallWrapUpPending(true);
      // Lock composer while generating follow-up so user can't send messages before it
      setOnboardingBeginPending(true);

      void (async () => {
        try {
          await saveQueueRef.current.catch(() => undefined);

          const response = await fetchWithAuth("/api/talent/chat/call-wrapup", {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              conversationStarterId:
                activeCallConversationStarterId ?? undefined,
              internalCallRequestId: activeInternalCallRequestId ?? undefined,
              transcript: transcript.map((e) => ({
                role: e.role,
                text: e.text,
              })),
              durationSeconds,
              forceCompleteOnboarding,
              locale,
            }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            console.error("[CareerOnboardingVoice] Follow-up failed:", payload);
            setChatError(tCareer(H.callWrapupMessageFailed));
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
            showOpportunityDiscoveryStartedToast(
              tCareer(H.opportunityDiscoveryStarted)
            );
          }
          if (
            payload &&
            typeof payload === "object" &&
            "talentPreferences" in payload
          ) {
            onTalentPreferencesRefreshed?.(
              payload.talentPreferences,
              "preferencesUpdatedAt" in payload
                ? payload.preferencesUpdatedAt
                : null
            );
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
          if (
            payload &&
            typeof payload === "object" &&
            "talentProfile" in payload
          ) {
            onTalentProfileRefreshed?.(
              payload.talentProfile as SessionResponse["talentProfile"]
            );
          }
          if (
            payload &&
            typeof payload === "object" &&
            Array.isArray(payload.pendingInternalOpportunityCallRequests)
          ) {
            onPendingInternalOpportunityCallRequestsChanged?.(
              payload.pendingInternalOpportunityCallRequests as CareerInternalOpportunityCallRequest[]
            );
          } else if (
            payload &&
            typeof payload === "object" &&
            "pendingInternalOpportunityCallRequest" in payload
          ) {
            onPendingInternalOpportunityCallRequestChanged?.(
              (payload.pendingInternalOpportunityCallRequest ??
                null) as CareerInternalOpportunityCallRequest | null
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
          setChatError(tCareer(H.callWrapupMessageFailed));
        } finally {
          setOnboardingBeginPending(false);
          callWrapUpPendingRef.current = false;
          setCallWrapUpPending(false);
          activeCallConversationStarterIdRef.current = null;
          activeInternalCallRequestIdRef.current = null;
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
      locale,
      onMessagesChanged,
      onOpportunityRunChanged,
      onTalentPreferencesRefreshed,
      onTalentInsightsRefreshed,
      onTalentProfileRefreshed,
      onPendingInternalOpportunityCallRequestChanged,
      onPendingInternalOpportunityCallRequestsChanged,
      saveRealtimeTurn,
      setChatError,
      setStage,
      tCareer,
    ]
  );

  // Wire endCallModeRef for auto-end on interview completion
  useEffect(() => {
    endCallModeRef.current = handleEndCallMode;
  }, [handleEndCallMode]);

  // Auto-end call after AI finishes speaking when interview is completed
  useEffect(() => {
    const wasAssistantSpeaking = wasAssistantSpeakingRef.current;
    wasAssistantSpeakingRef.current = realtimeSession.isAssistantSpeaking;
    if (
      pendingCallEndRef.current &&
      wasAssistantSpeaking &&
      !realtimeSession.isAssistantSpeaking
    ) {
      scheduleCallEndAfterRealtimePlayback();
    }
  }, [
    realtimeSession.isAssistantSpeaking,
    scheduleCallEndAfterRealtimePlayback,
  ]);

  const resetOnboardingState = useCallback(() => {
    setShowVoiceStartPrompt(false);
    setOnboardingBeginPending(false);
    setOnboardingWrapupPending(false);
    setOnboardingPausePending(false);
    setCallStartPending(false);
    setCallWrapUpPending(false);
    callStartedAtRef.current = null;
    callWrapUpPendingRef.current = false;
    pendingAssistantDoneRef.current = null;
    pendingAssistantDeltaTextRef.current = "";
    pendingCallEndRef.current = false;
    suppressNextAssistantDoneRef.current = false;
    lastRealtimeUserTextRef.current = "";
    activeCallConversationStarterIdRef.current = null;
    activeInternalCallRequestIdRef.current = null;
    clearRealtimeTurnSyncState();
  }, [clearRealtimeTurnSyncState]);

  return {
    showVoiceStartPrompt,
    onboardingBeginPending,
    onboardingWrapupPending,
    callStartPending,
    callWrapUpPending,
    onboardingPausePending,
    inputMode,
    voiceTranscript,
    liveUserTranscriptPlacement,
    voiceMuted,
    handleToggleVoiceMute,
    handleStartCallMode,
    handleEndCallMode,
    primeCallAudioPlayback,
    callTranscriptEntries,
    connectionStatus,
    handleUseChatOnly,
    handlePauseOnboarding,
    handleSubmitOnboardingInterest,
    handleContinueOnboardingConversation,
    applySessionPrompt,
    handleProfileSubmitSuccess,
    resetOnboardingState,
    isAssistantSpeaking: realtimeSession.isAssistantSpeaking,
  };
};
