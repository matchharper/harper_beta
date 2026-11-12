import { receiveCareerReply } from "./careerReplyStream";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { createCareerMessageMerger } from "./careerMessageMerge";
import type { InternalCallChatSubmission } from "@/lib/career/internalCallAnswers";
import type { SimulationCardRequest } from "@/lib/career/simulation/session";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import { getErrorMessage, sleep, toUiMessage } from "./careerHelpers";
import { showOpportunityDiscoveryStartedToast } from "./opportunityDiscoveryToast";
import type { FetchWithAuth } from "./useCareerApi";
import type { CareerConversationStarterId } from "@/lib/career/prompts/conversationStarters";
import { buildChatTypewriterChunks } from "@/lib/chat/typewriter";
import {
  createRecommendJobPostingStatusLog,
  isRecommendJobPostingPhase,
  splitRecommendJobPostingStatusLogs,
  upsertRecommendJobPostingStatusLog,
} from "@/lib/talentOnboarding/recommendJobPostingStatus";
import type { TalentUserChatMessageType } from "@/lib/talentOnboarding/onboarding";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { normalizeLocale } from "@/i18n/localeResolution";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import type { CareerOpportunityMention } from "@/lib/career/opportunityMentionText";
import type { CareerPendingActionReference } from "@/lib/career/pendingActions";
import { uploadTalentDocument } from "@/lib/talentOnboarding/documentUploadClient";
import { useCareerTextChatModelStore } from "@/store/useCareerTextChatModelStore";
import { useCareerPromptVariantStore } from "@/store/useCareerPromptVariantStore";
import { getCareerBrowserTimeZone } from "@/lib/career/requestTimeZone";
import type { CareerCoachingActivity } from "@/lib/career/careerCoachingActivitySchema";

type SendChatArgs = {
  formResponseMessageId?: number;
  internalCallAnswerSubmission?: InternalCallChatSubmission;
  applicationPreparationContinuation?: {sessionMessageId:number; continuationId:string};
  applicationInputSubmission?: {batchId:string; sessionMessageId:number; expectedRevision:number};
  simulationAction?:SimulationCardRequest;
  files?: File[];
  channel?: "chat" | "voice";
  coachingActivityAction?: {
    action: "start" | "end";
    activityMessageId: number;
    channel?: "chat" | "call";
    expectedRevision: number;
  };
  conversationStarterId?: CareerConversationStarterId;
  text: string;
  link?: string;
  messageType?: TalentUserChatMessageType;
  opportunityMentions?: CareerOpportunityMention[];
  viewedRoleId?: string;
  pendingAction?: CareerPendingActionReference;
  actionItem?: { id: string; revision: number };
  onSuccess?: () => void;
  onError?: () => void;
};

type SendChatOptions = {
  profilePending?: boolean;
};

type QueuedChatMessage = {
  tempId: string;
  clientRequestId: string;
  createdAt: string;
  conversationId: string;
  stopped: boolean;
};

type CareerChatStreamEvent = {
  data: unknown;
  event: string;
};

type UseCareerChatArgs = {
  isOnboardingDone?: boolean;
  user: User | null;
  conversationId: string | null;
  sessionPending: boolean;
  fetchWithAuth: FetchWithAuth;
  onCareerCoachingCallReady?: (
    activity: CareerCoachingActivity
  ) => void | Promise<void>;
  onOpportunityRunChanged?: (run: CareerOpportunityRun | null) => void;
  onOpportunityRecommendationsChanged?: (
    roleId?: string | null
  ) => void | Promise<void>;
  onTalentPreferencesRefreshed?: (
    preferences: unknown,
    updatedAt: unknown
  ) => void;
  onTalentInsightsRefreshed?: (insights: unknown, updatedAt: unknown) => void;
  onTalentContextsRefreshed?: (payload: {
    talentBrief?: unknown;
    talentContextsUpdatedAt?: unknown;
    talentMemories?: unknown;
  }) => void;
  onOnboardingChecklistProgressRefreshed?: (progress: unknown) => void;
  onTalentProfileRefreshed?: (
    profile: SessionResponse["talentProfile"] | undefined
  ) => void;
  persistedMessages: CareerMessage[];
  hasDurableWork?: boolean;
  hasActiveInputTurn?: boolean;
  onRequestAdmitted?: () => void | Promise<void>;
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
};

const replaceMessageById = (
  messages: CareerMessage[],
  targetId: string | number,
  nextMessage: CareerMessage
) => {
  const targetKey = String(targetId);
  let nextIndex = messages.findIndex(
    (message) => String(message.id) === targetKey
  );
  if (nextIndex < 0) nextIndex = messages.findIndex(
    (message) => String(message.id) === String(nextMessage.id)
  );

  if (nextIndex < 0 && nextMessage.clientRequestId) nextIndex = messages.findIndex(
    message => message.role === "user" && message.clientRequestId === nextMessage.clientRequestId
  );
  if (nextIndex < 0) {
    return [...messages, nextMessage];
  }

  const previous=messages[nextIndex]?.applicationActivity, incoming=nextMessage.applicationActivity;
  if(previous && incoming && previous.activityId===incoming.activityId && previous.revision>incoming.revision) return messages;
  const nextMessages = [...messages];
  nextMessages[nextIndex] = nextMessage;
  return nextMessages;
};

const parseSseEvent = (rawEvent: string): CareerChatStreamEvent | null => {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  const rawData = dataLines.join("\n").trim();
  if (!rawData) return { event, data: null };

  try {
    return { event, data: JSON.parse(rawData) };
  } catch {
    return { event, data: rawData };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const isCareerMessagePayload = (
  value: unknown
): value is CareerMessagePayload =>
  isRecord(value) &&
  typeof value.id === "number" &&
  (value.role === "user" || value.role === "assistant") &&
  typeof value.content === "string";

const toStreamMessagePayload = (
  value: unknown
): CareerMessagePayload | null => {
  if (!isCareerMessagePayload(value)) return null;
  return value;
};

const toRecommendationSearchStatus = (
  value: unknown
): CareerRecommendationSearchStatus | null => {
  if (!isRecord(value)) return null;
  const state = value.state;
  if (
    state !== "running" &&
    state !== "completed" &&
    state !== "error" &&
    state !== "stopped"
  ) {
    return null;
  }

  return {
    ...(isRecommendJobPostingPhase(value.phase) ? { phase: value.phase } : {}),
    scoredCount: typeof value.scoredCount === "number" ? value.scoredCount : null,
    candidateCount:
      typeof value.candidateCount === "number" ? value.candidateCount : null,
    recommendationCount:
      typeof value.recommendationCount === "number"
        ? value.recommendationCount
        : null,
    state,
  };
};

const toRecommendationStatusAnchor = (value: unknown) => {
  if (!isRecord(value)) return null;
  const contentLength = value.contentLength;
  if (
    typeof contentLength !== "number" ||
    !Number.isFinite(contentLength) ||
    contentLength < 0
  ) {
    return null;
  }
  return Math.floor(contentLength);
};

const isAbortLikeError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

export const useCareerChat = ({
  isOnboardingDone,
  user,
  conversationId,
  sessionPending,
  fetchWithAuth,
  onCareerCoachingCallReady,
  onOpportunityRunChanged,
  onOpportunityRecommendationsChanged,
  onTalentPreferencesRefreshed,
  onTalentInsightsRefreshed,
  onTalentContextsRefreshed,
  onOnboardingChecklistProgressRefreshed,
  onTalentProfileRefreshed,
  persistedMessages,
  onRequestAdmitted,
  hasDurableWork = false,
  hasActiveInputTurn = false,
  onMessagesChanged,
}: UseCareerChatArgs) => {
  const tCareer = useCareerMessageFormatter();
  const { locale, setLocale } = useMessages();
  const textChatModel = useCareerTextChatModelStore((state) => state.model);
  const conversationVersion = useCareerWorkspaceUiStore((state) => state.conversationVersion);
  const promptVariant = useCareerPromptVariantStore((state) => state.variant);
  const [stage, setStage] = useState<CareerStage>("profile");
  const [localMessages, setLocalMessages] = useState<CareerMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [admissions, setAdmissions] = useState<Record<string, number>>({});
  const [continuationMessageId, setContinuationMessageId] = useState<number | null>(null);
  const [chatError, setChatError] = useState("");
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [toolStatusMessage, setToolStatusMessage] = useState("");
  const [activeThinkingLogs, setActiveThinkingLogs] = useState<string[]>([]);
  const [
    activeRecommendationSearchStatus,
    setActiveRecommendationSearchStatus,
  ] = useState<CareerRecommendationSearchStatus | null>(null);
  const [onboardingWrapupPending, setOnboardingWrapupPending] = useState(false);
  const [thinkingLogsByMessageId, setThinkingLogsByMessageId] = useState<
    Record<string, string[]>
  >({});
  const [scrollTick, setScrollTick] = useState(0);
  const [sentMessageTick, setSentMessageTick] = useState(0);
  const [queuedMessageConversations, setQueuedMessageConversations] = useState<Record<string, string>>({});
  const inlineSendQueue = useRef<Promise<void> | null>(null);
  const stopRequest = useRef<Promise<void> | null>(null);
  const queuedMessages = useRef(new Map<string, QueuedChatMessage>());

  const activeThinkingLogsRef = useRef<string[]>([]);
  const inFlightAdmissions = useRef(new Map<string, { conversationId: string; stopped: boolean }>());
  const liveReplyStreams = useRef(new Map<string, { conversationId: string; stopped: boolean }>());
  const failedAdmissions = useRef(new Map<string, { requestId: string; body?: string }>());
  const admissionFileIds = useRef(new WeakMap<File, string>());
  const activeConversationStarterRef = useRef<{
    remainingFollowUpTurns: number;
    starterId: CareerConversationStarterId;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeStreamAssistantIdRef = useRef<string | null>(null);
  const activeStreamAssistantRef = useRef<CareerMessage | null>(null);
  const activeUserMessageRef = useRef<CareerMessagePayload | null>(null);
  const activeClientRequestIdRef = useRef<string | null>(null);
  const activeOptimisticMessageIdRef = useRef<string | null>(null);
  const cancellationSavePendingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const typingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const admissionQueues = useRef(new Map<string, Promise<void>>());
  const mountedRef = useRef(true);
  const currentConversationRef = useRef(conversationId);
  useEffect(() => { currentConversationRef.current = conversationId; }, [conversationId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const continuationPending = continuationMessageId !== null && !persistedMessages.some(message =>
    Number(message.id) === continuationMessageId && (message.turnStopped || message.turnPending === false));

  const syncPreferredLocale = useCallback(
    (value: unknown) => {
      const nextLocale = normalizeLocale(value);
      if (nextLocale && nextLocale !== locale) setLocale(nextLocale);
    },
    [locale, setLocale]
  );

  const enqueueAssistantTypewriter = useCallback((message: CareerMessage) => {
    typingQueueRef.current = typingQueueRef.current.then(async () => {
      if (!mountedRef.current) return;

      if (useCareerWorkspaceUiStore.getState().conversationVersion === "friendly") {
        setLocalMessages(prev => [...prev, message]);
        setScrollTick(t => t + 1);
        return;
      }
      setAssistantTyping(true);
      const id = String(message.id);
      setLocalMessages((prev) => [
        ...prev,
        {
          ...message,
          content: "",
          typing: true,
          typingMode: "word",
        },
      ]);

      const fullText = message.content;
      const chunks = buildChatTypewriterChunks(fullText);
      const delay = Math.max(
        45,
        Math.min(130, Math.floor(2200 / Math.max(chunks.length, 12)))
      );
      let visibleText = "";
      for (const chunk of chunks) {
        if (!mountedRef.current) return;
        await sleep(delay);
        visibleText += chunk;
        setLocalMessages((prev) =>
          prev.map((item) =>
            String(item.id) === id
              ? {
                  ...item,
                  content: visibleText,
                }
              : item
          )
        );
      }

      setLocalMessages((prev) =>
        prev.map((item) =>
          String(item.id) === id
            ? {
                ...item,
                content: fullText,
                typing: false,
                typingMode: undefined,
              }
            : item
        )
      );
      setAssistantTyping(false);
    });

    return typingQueueRef.current;
  }, []);

  const resetActiveThinkingLogs = useCallback(() => {
    activeThinkingLogsRef.current = [];
    setActiveThinkingLogs([]);
    setActiveRecommendationSearchStatus(null);
    setOnboardingWrapupPending(false);
    setToolStatusMessage("");
  }, []);

  const appendThinkingLog = useCallback((message: string) => {
    const normalized = message.replace(/\s+/g, " ").trim();
    if (!normalized) return;

    const current = activeThinkingLogsRef.current;
    const next =
      current[current.length - 1] === normalized
        ? current
        : [...current, normalized].slice(-12);
    activeThinkingLogsRef.current = next;
    setActiveThinkingLogs(next);
    setToolStatusMessage(normalized);
    setScrollTick((t) => t + 1);
  }, []);

  const appendRecommendationStatusToActiveLogs = useCallback(
    (status: CareerRecommendationSearchStatus) => {
      const log = createRecommendJobPostingStatusLog(status);
      const current = activeThinkingLogsRef.current;
      const next =
        current[current.length - 1] === log
          ? current
          : [...current, log].slice(-12);
      activeThinkingLogsRef.current = next;
      setActiveThinkingLogs(next);
      setActiveRecommendationSearchStatus(status);
      setScrollTick((t) => t + 1);
      return next;
    },
    []
  );

  const markActiveChatStopped = useCallback(() => {
    const optimisticId = activeOptimisticMessageIdRef.current;
    const activeStreamAssistant = activeStreamAssistantRef.current;
    const latestLogs =
      activeStreamAssistant?.thinkingLogs ?? activeThinkingLogsRef.current;
    const previousStatus = splitRecommendJobPostingStatusLogs(latestLogs).latestStatus;
    const stoppedStatus: CareerRecommendationSearchStatus | null = previousStatus
      ? { ...previousStatus, state: "stopped" } : null;
    const streamAssistantId = activeStreamAssistantIdRef.current;
    const activeUserMessage = activeUserMessageRef.current;
    const logs = stoppedStatus ? upsertRecommendJobPostingStatusLog(latestLogs, stoppedStatus) : latestLogs;
    activeThinkingLogsRef.current = logs;
    setActiveThinkingLogs(logs);
    setActiveRecommendationSearchStatus(stoppedStatus);
    const stoppedUserMessage = activeUserMessage
      ? {
          ...activeUserMessage,
          turnStopped: true,
          thinkingLogs: stoppedStatus ? upsertRecommendJobPostingStatusLog(activeUserMessage.thinkingLogs, stoppedStatus) : activeUserMessage.thinkingLogs,
        }
      : null;
    const stoppedAssistantMessage = activeStreamAssistant
      ? {
          ...activeStreamAssistant,
          workPending: false,
          workCompletedAt: new Date().toISOString(),
          turnStopped: true,
          thinkingLogs: logs,
          typing: false,
        }
      : null;

    if (stoppedUserMessage || stoppedAssistantMessage) {
      if (stoppedUserMessage) {
        activeUserMessageRef.current = stoppedUserMessage;
      }
      setLocalMessages((prev) => {
        const withStoppedUser = stoppedUserMessage
          ? replaceMessageById(
              prev,
              stoppedUserMessage.id,
              toUiMessage(stoppedUserMessage)
            )
          : prev;
        if (!streamAssistantId || !stoppedAssistantMessage) {
          return withStoppedUser;
        }
        return withStoppedUser.map((item) =>
          String(item.id) === streamAssistantId ? stoppedAssistantMessage : item
        );
      });
    }

    activeStreamAssistantIdRef.current = null;
    activeStreamAssistantRef.current = null;
    setLocalMessages(messages => messages.map(message =>
      String(message.id) === optimisticId ? { ...message, turnStopped: true } : message));
    setAssistantTyping(false);
    setOnboardingWrapupPending(false);
    setScrollTick((t) => t + 1);
    return {
      assistantMessage: stoppedAssistantMessage,
      userMessage: stoppedUserMessage,
    };
  }, []);

  const cancelActiveChat = useCallback(() => {
    if (cancellationSavePendingRef.current) return;
    const sourceMessage = activeUserMessageRef.current;
    const assistantSnapshot = activeStreamAssistantRef.current;
    const assistantSnapshotId = activeStreamAssistantIdRef.current;
    const requestId = activeClientRequestIdRef.current;
    const optimisticId = activeOptimisticMessageIdRef.current;
    const activeController = abortControllerRef.current;
    if (!conversationId) return;
    const pendingAdmissions = [...new Map([...inFlightAdmissions.current, ...liveReplyStreams.current]).entries()].filter(([, value]) => value.conversationId === conversationId);
    const pendingQueuedMessages = [...queuedMessages.current.values()].filter(message => message.conversationId === conversationId);
    const failedRequests = [...failedAdmissions.current.entries()].filter(([key]) => JSON.parse(key)[1] === conversationId);

    cancellationSavePendingRef.current = true;
    setStopPending(true);
    setChatError("");
    const stopping = (async () => {
      let confirmed = false;
      try {
        const response = await fetchWithAuth("/api/talent/chat/stop", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            stopAll: true,
            clientRequestIds: [...pendingAdmissions.map(([id]) => id), ...failedRequests.map(([, value]) => value.requestId)],
            clientRequestId: requestId,
            assistantMessage: assistantSnapshot ? {
              content: assistantSnapshot.content,
              recommendationStatusAfterCharCount: assistantSnapshot.recommendationStatusAfterCharCount,
              thinkingLogs: assistantSnapshot.thinkingLogs,
            } : undefined,
            userMessageId: sourceMessage?.id,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(getErrorMessage(payload, tCareer(H.messageSendFailed)));
        confirmed = true;
        const stoppedQueuedIds = new Set<string>();
        for (const queued of pendingQueuedMessages) {
          queued.stopped = true;
          stoppedQueuedIds.add(queued.tempId);
        }
        setLocalMessages(current => current.filter(message => !stoppedQueuedIds.has(String(message.id))));
        setQueuedMessageConversations(current => Object.fromEntries(
          Object.entries(current).filter(([id]) => !pendingQueuedMessages.some(message => message.clientRequestId === id))
        ));
        for (const [, admission] of pendingAdmissions) admission.stopped = true;
        setLocalMessages(current => current.map(message => String(message.id).startsWith("live:")
          ? { ...message, typing: false, workPending: false } : message));
        for (const [key] of failedRequests) failedAdmissions.current.delete(key);
        setAdmissions(current => { const next = { ...current }; delete next[conversationId]; return next; });
        await Promise.resolve(onRequestAdmitted?.()).catch(() => undefined);
        if (!mountedRef.current || currentConversationRef.current !== conversationId || activeClientRequestIdRef.current !== requestId) return;

        // Only the persisted Stop may detach the stream or mark it stopped.
        // A failed request leaves the original execution attached and retryable.
        cancelRequestedRef.current = true;
        setContinuationMessageId(null);
        markActiveChatStopped();
        const updatedUserMessage = isRecord(payload) ? toStreamMessagePayload(payload.userMessage) : null;
        const stoppedMessages = (isRecord(payload) && Array.isArray(payload.userMessages) ? payload.userMessages : [])
          .map(toStreamMessagePayload).filter((message): message is CareerMessagePayload => message !== null);
        if (stoppedMessages.length) {
          setLocalMessages(prev => stoppedMessages.reduce((messages, message) => replaceMessageById(messages, message.id, toUiMessage(message)), prev));
          await Promise.resolve(onMessagesChanged?.(stoppedMessages)).catch(() => undefined);
        }
        if (!updatedUserMessage) return;
        const updatedAssistantMessage = isRecord(payload) ? toStreamMessagePayload(payload.assistantMessage) : null;
        setLocalMessages((prev) => {
          const withoutPlaceholder = updatedAssistantMessage && assistantSnapshotId
            ? prev.filter(item => String(item.id) !== assistantSnapshotId) : prev;
          const withUser = replaceMessageById(withoutPlaceholder,
            sourceMessage?.id ?? optimisticId ?? updatedUserMessage.id, toUiMessage(updatedUserMessage));
          return updatedAssistantMessage
            ? replaceMessageById(withUser, updatedAssistantMessage.id, toUiMessage(updatedAssistantMessage)) : withUser;
        });
        await Promise.resolve(onMessagesChanged?.([
          updatedUserMessage, ...(updatedAssistantMessage ? [updatedAssistantMessage] : []),
        ])).catch(() => undefined);
      } catch (error) {
        if (mountedRef.current && currentConversationRef.current === conversationId && activeClientRequestIdRef.current === requestId)
          setChatError(error instanceof Error ? error.message : tCareer(H.messageSendUnexpected));
      } finally {
        cancellationSavePendingRef.current = false;
        setStopPending(false);
        if (confirmed) activeController?.abort();
        if (currentConversationRef.current === conversationId && activeClientRequestIdRef.current === requestId) {
          if (confirmed) {
            activeClientRequestIdRef.current = null;
            activeOptimisticMessageIdRef.current = null;
            activeUserMessageRef.current = null;
            setChatPending(false);
          } else if (abortControllerRef.current !== activeController) {
            setChatPending(false);
          }
        }
      }
    })();
    stopRequest.current = stopping;
    void stopping.finally(() => {
      if (stopRequest.current === stopping) stopRequest.current = null;
    });
  }, [conversationId, fetchWithAuth, markActiveChatStopped, onMessagesChanged, onRequestAdmitted, tCareer]);

  const attachThinkingLogsToMessage = useCallback(
    (messageId: string | number) => {
      const logs = activeThinkingLogsRef.current;
      if (logs.length === 0) return;
      setThinkingLogsByMessageId((prev) => ({
        ...prev,
        [String(messageId)]: logs,
      }));
    },
    []
  );

  const applySessionConversation = useCallback((payload: SessionResponse) => {
    setStage(payload.conversation.stage);
    for (const queued of queuedMessages.current.values()) queued.stopped = true;
    for (const stream of liveReplyStreams.current.values()) stream.stopped = true;
    liveReplyStreams.current.clear();
    queuedMessages.current.clear();
    setQueuedMessageConversations({});
    inlineSendQueue.current = null;
    stopRequest.current = null;
    setLocalMessages([]);
    activeConversationStarterRef.current = null;
    activeStreamAssistantIdRef.current = null;
    activeStreamAssistantRef.current = null;
    activeUserMessageRef.current = null;
    activeClientRequestIdRef.current = null;
    activeOptimisticMessageIdRef.current = null;
    cancellationSavePendingRef.current = false;
    setContinuationMessageId(null);
    activeThinkingLogsRef.current = [];
    setActiveThinkingLogs([]);
    setActiveRecommendationSearchStatus(null);
    setOnboardingWrapupPending(false);
    setThinkingLogsByMessageId({});
    setToolStatusMessage("");
  }, []);

  const appendMessage = useCallback((message: CareerMessage) => {
    setLocalMessages((prev) => [...prev, message]);
    setScrollTick((t) => t + 1);
  }, []);

  const removeMessages = useCallback((messageIds: Array<string | number>) => {
    if (messageIds.length === 0) return;

    const idsToRemove = new Set(messageIds.map((id) => String(id)));
    setLocalMessages((current) =>
      current.filter((message) => !idsToRemove.has(String(message.id)))
    );
    setThinkingLogsByMessageId((current) => {
      const next = { ...current };
      for (const messageId of idsToRemove) {
        delete next[messageId];
      }
      return next;
    });
    setScrollTick((t) => t + 1);
  }, []);

  const regenerateOnboardingWrapup = useCallback(async () => {
    if (!user || !conversationId || onboardingWrapupPending) return;

    setChatError("");
    setOnboardingWrapupPending(true);
    try {
      const response = await fetchWithAuth(
        "/api/talent/onboarding/wrapup/regenerate",
        {
          method: "POST",
          body: JSON.stringify({ conversationId }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.callWrapupRegenerateFailed))
        );
      }

      const messagePayloads =
        isRecord(payload) && Array.isArray(payload.messages)
          ? payload.messages
              .map(toStreamMessagePayload)
              .filter((item): item is CareerMessagePayload => item !== null)
          : [];
      const fallbackMessagePayload = isRecord(payload)
        ? toStreamMessagePayload(payload.message)
        : null;
      const nextMessagePayloads =
        messagePayloads.length > 0
          ? messagePayloads
          : fallbackMessagePayload
            ? [fallbackMessagePayload]
            : [];
      if (nextMessagePayloads.length === 0) {
        throw new Error(tCareer(H.callWrapupEmpty));
      }

      setLocalMessages((prev) =>
        nextMessagePayloads.reduce(
          (messages, messagePayload) =>
            replaceMessageById(
              messages,
              messagePayload.id,
              toUiMessage(messagePayload)
            ),
          prev
        )
      );
      await onMessagesChanged?.(nextMessagePayloads);
      setScrollTick((t) => t + 1);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : tCareer(H.callWrapupRegenerateUnexpected)
      );
    } finally {
      setOnboardingWrapupPending(false);
    }
  }, [
    conversationId,
    fetchWithAuth,
    onboardingWrapupPending,
    onMessagesChanged,
    tCareer,
    user,
  ]);

  const executeChatMessage = useCallback(
    async (args: SendChatArgs, options?: SendChatOptions, queued?: QueuedChatMessage) => {
      if (cancellationSavePendingRef.current) { args.onError?.(); return; }
      // Accept input immediately, but persist it in send order. Only the short
      // admission request is serialized; no LLM/browser completion is awaited.
      if ((isOnboardingDone || stage === "completed") && args.channel !== "voice") {
        if (!user || !conversationId || sessionPending || options?.profilePending) { args.onError?.(); return; }
        if (!args.text.trim() && !args.files?.length && !args.formResponseMessageId && !args.internalCallAnswerSubmission) return;
        const fileIds = (args.files ?? []).map(file => {
          let id = admissionFileIds.current.get(file);
          if (!id) { id = crypto.randomUUID(); admissionFileIds.current.set(file, id); }
          return id;
        });
        // Exact failed transport envelopes retain identity on an explicit retry.
        // This does not deduplicate new successful messages by their wording.
        const draftKey = JSON.stringify([user.id, conversationId, args.text, args.link, args.messageType,
          args.opportunityMentions, args.viewedRoleId, args.actionItem, args.formResponseMessageId, args.conversationStarterId, args.coachingActivityAction, args.internalCallAnswerSubmission, args.pendingAction, fileIds]);
        const admission = failedAdmissions.current.get(draftKey) ?? { requestId: queued?.clientRequestId ?? crypto.randomUUID(), body: undefined };
        const clientRequestId = admission.requestId;
        const pendingAdmission = { conversationId, stopped: false };
        inFlightAdmissions.current.set(clientRequestId, pendingAdmission);
        const tempId = queued?.tempId ?? `temp-user-${clientRequestId}`;
        const inputPending = Boolean(queued) || hasActiveInputTurn;
        if (!queued) {
          setLocalMessages(prev => [...prev, { id: tempId, clientRequestId, role: "user", content: args.text, inputPending,
            opportunityMentions: args.opportunityMentions, messageType: args.messageType ?? "chat", createdAt: new Date().toISOString() }]);
          setSentMessageTick(tick => tick + 1);
        }
        setChatError("");
        setAdmissions(current => ({ ...current, [conversationId]: (current[conversationId] ?? 0) + 1 }));
        const previousAdmission = admissionQueues.current.get(conversationId);
        let releaseAdmission!: () => void;
        const admissionTurn = new Promise<void>(resolve => { releaseAdmission = resolve; });
        admissionQueues.current.set(conversationId, admissionTurn);
        try {
          if (previousAdmission) await previousAdmission;
          const uploadedDocumentIds: string[] = [];
          for (const file of admission.body ? [] : args.files ?? []) {
            const uploaded = await uploadTalentDocument({ fetchWithAuth, file, source: "chat" });
            if (typeof uploaded?.document?.id !== "string") throw new Error(tCareer(H.documentUploadFailed));
            uploadedDocumentIds.push(uploaded.document.id);
          }
          const body = admission.body ?? JSON.stringify({ durable: true, conversationId, clientRequestId, message: args.text,
            link: args.link, messageType: args.messageType, opportunityMentions: args.opportunityMentions,
            viewedRoleId: args.viewedRoleId, uploadedDocumentIds, formResponseMessageId: args.formResponseMessageId,
            actionItem: args.actionItem, conversationStarterId: args.conversationStarterId,
            coachingActivityAction: args.coachingActivityAction, internalCallAnswerSubmission: args.internalCallAnswerSubmission, pendingAction: args.pendingAction,
            locale, textChatModel, conversationVersion, promptVariant, timeZone: getCareerBrowserTimeZone() });
          admission.body = body;
          const response = await fetchWithAuth("/api/talent/chat", { method: "POST", headers: { Accept: "text/event-stream" }, body });
          if (response.headers.get("content-type")?.includes("text/event-stream")) liveReplyStreams.current.set(clientRequestId, pendingAdmission);
          const streamedMessages = new Map<CareerMessage["id"], CareerMessage>();
          const payload = await receiveCareerReply(response, {
            onMessage: (message, live) => {
              if (!mountedRef.current || currentConversationRef.current !== conversationId || pendingAdmission.stopped) return;
              const next = toUiMessage(message);
              if (live) {
                // Activity text lives in workEvents. The stream mode gives it
                // precedence over polling without showing an empty typing bubble.
                next.typing = false;
                next.typingMode = "stream";
                streamedMessages.set(next.id, next);
              }
              setLocalMessages(previous => {
                const rows = !live && message.messageType === "chat" && message.workReplyId
                  ? previous.filter(row => row.id !== `live:${message.workReplyId}`) : previous;
                return replaceMessageById(rows, message.id, next);
              });
              if (!live) void Promise.resolve(onMessagesChanged?.([message])).catch(() => undefined);
              setScrollTick(tick => tick + 1);
            },
            onSettled: () => {
              liveReplyStreams.current.delete(clientRequestId);
              if (!mountedRef.current || currentConversationRef.current !== conversationId) return;
              // Release only the frames this connection delivered. A different
              // connection may already have taken over the same reply.
              if (streamedMessages.size) {
                setLocalMessages(previous => previous.map(message =>
                  streamedMessages.get(message.id) === message
                    ? { ...message, typingMode: undefined } : message));
              }
              void Promise.resolve(onRequestAdmitted?.()).catch(() => undefined);
            },
          });
          if (!response.ok || !payload.userMessage) throw new Error(getErrorMessage(payload, tCareer(H.messageSendFailed)));
          const message = payload.userMessage as CareerMessagePayload;
          releaseAdmission();
          if (pendingAdmission.stopped) message.turnStopped = true;
          failedAdmissions.current.delete(draftKey);
          setLocalMessages(prev => replaceMessageById(prev, tempId, { ...toUiMessage(message), inputPending }));
          await Promise.resolve(onMessagesChanged?.([message])).catch(() => undefined);
          setScrollTick(tick => tick + 1);
          args.onSuccess?.();
          // Hand the immediate indicator to the durable projection before clearing it.
          await Promise.resolve(onRequestAdmitted?.()).catch(() => undefined);
        } catch (error) {
          if (!pendingAdmission.stopped) failedAdmissions.current.set(draftKey, admission);
          if (!pendingAdmission.stopped) setChatError(error instanceof Error ? error.message : tCareer(H.messageSendFailed));
          setLocalMessages(prev => prev.filter(item => item.id !== tempId));
          args.onError?.();
        } finally {
          releaseAdmission();
          if (admissionQueues.current.get(conversationId) === admissionTurn) admissionQueues.current.delete(conversationId);
          inFlightAdmissions.current.delete(clientRequestId);
          if (!pendingAdmission.stopped) setAdmissions(current => {
            const next = { ...current };
            if (next[conversationId] > 1) next[conversationId]--;
            else delete next[conversationId];
            return next;
          });
        }
        return;
      }
      if (
        !user ||
        !conversationId ||
        sessionPending ||
        stage === "profile" ||
        options?.profilePending ||
        cancellationSavePendingRef.current
      ) {
        args.onError?.();
        return;
      }

      const text = args.text.trim();
      const link = (args.link ?? "").trim();
      const files = (args.files ?? []).slice(0, 5);
      if (!text && files.length === 0 && !args.formResponseMessageId && !args.internalCallAnswerSubmission) return;

      const explicitConversationStarterId = args.conversationStarterId;
      if (
        explicitConversationStarterId &&
        explicitConversationStarterId !== "career_coaching"
      ) {
        activeConversationStarterRef.current = {
          remainingFollowUpTurns: 6,
          starterId: explicitConversationStarterId,
        };
      }
      const activeConversationStarterId =
        explicitConversationStarterId ??
        activeConversationStarterRef.current?.starterId;
      const visibleText = text || files.map((file) => file.name).join(", ");
      const optimisticAttachments = files.map((file) => ({
        mime: file.type || undefined,
        name: file.name,
        size: file.size,
      }));
      const composed = link
        ? `${visibleText}\n\n${tCareer(H.referenceLink, { link })}`
        : visibleText;
      const messageType = args.messageType ?? "chat";
      const clientRequestId = queued?.clientRequestId ?? crypto.randomUUID();
      const tempId = queued?.tempId ?? (args.formResponseMessageId ? String(args.formResponseMessageId) : `temp-user-${clientRequestId}`);
      activeClientRequestIdRef.current = clientRequestId;
      activeOptimisticMessageIdRef.current = tempId;
      const isCurrentRequest = () => activeClientRequestIdRef.current === clientRequestId;
      const nowIso = queued?.createdAt ?? new Date().toISOString();

      setChatError("");
      resetActiveThinkingLogs();
      cancelRequestedRef.current = false;
      setContinuationMessageId(null);
      cancellationSavePendingRef.current = false;
      activeUserMessageRef.current = null;
      activeStreamAssistantIdRef.current = null;
      activeStreamAssistantRef.current = null;
      setChatPending(true);
      if (!queued && !args.formResponseMessageId && !args.internalCallAnswerSubmission) setLocalMessages((prev) => [
        ...prev,
        {
          attachments: optimisticAttachments,
          id: tempId,
          clientRequestId,
          role: "user",
          content: composed,
          opportunityMentions: args.opportunityMentions,
          messageType,
          createdAt: nowIso,
        },
      ]);

      if (!queued) setSentMessageTick(tick => tick + 1);

      let pendingAssistantMessageId: string | null = null;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const uploadedDocumentIds: string[] = [];
        for (const file of files) {
          const uploadPayload = await uploadTalentDocument({
            fetchWithAuth,
            file,
            signal: abortController.signal,
            source: "chat",
          });
          const documentId = isRecord(uploadPayload?.document)
            ? uploadPayload.document.id
            : null;
          if (typeof documentId !== "string" || !documentId.trim()) {
            throw new Error(
              getErrorMessage(uploadPayload, tCareer(H.documentUploadFailed))
            );
          }
          uploadedDocumentIds.push(documentId.trim());
        }

        if (!isCurrentRequest()) return;
        const response = await fetchWithAuth("/api/talent/chat", {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
          },
          signal: abortController.signal,
          body: JSON.stringify({
            channel: args.channel ?? "chat",
            formResponseMessageId: args.formResponseMessageId,
            internalCallAnswerSubmission: args.internalCallAnswerSubmission,
            coachingActivityAction: args.coachingActivityAction,
            conversationStarterId: activeConversationStarterId,
            conversationId,
            clientRequestId,
            locale,
            message: text,
            messageType,
            opportunityMentions: args.opportunityMentions,
            viewedRoleId: args.viewedRoleId,
            pendingAction: args.pendingAction,
            actionItem: args.actionItem,
            textChatModel,
            promptVariant,
            conversationVersion,
            timeZone: getCareerBrowserTimeZone(),
            uploadedDocumentIds,
            link,
          }),
        });

        const contentType = response.headers.get("content-type") ?? "";
        if (
          response.ok &&
          response.body &&
          contentType.includes("text/event-stream")
        ) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const streamAssistantId = `stream-assistant-${Date.now()}`;
          pendingAssistantMessageId = streamAssistantId;
          let buffer = "";
          let realUserMessage: CareerMessagePayload | null = null;
          let assistantPayloads: CareerMessagePayload[] = [];
          let recommendationRefreshPromise: Promise<void> | null = null;
          let messagesChangedPromise: Promise<void> | null = null;
          let lastMessagesChangedKey = "";
          let streamAssistantVisible = false;
          let streamDone = false;
          let suppressRolePreviews = false;

          const ensureStreamAssistant = () => {
            if (streamAssistantVisible) return;
            streamAssistantVisible = true;
            pendingAssistantMessageId = streamAssistantId;
            activeStreamAssistantIdRef.current = streamAssistantId;
            const streamAssistant: CareerMessage = {
              id: streamAssistantId,
              ...(conversationVersion === "professional" && realUserMessage ? { workReplyId: `message:${realUserMessage.id}` } : {}),
              workStartedAt: new Date().toISOString(),
              suppressRolePreviews,
              role: "assistant",
              content: "",
              messageType: "chat",
              createdAt: new Date().toISOString(),
              typing: true,
              typingMode: "stream",
            };
            activeStreamAssistantRef.current = streamAssistant;
            setAssistantTyping(true);
            setLocalMessages((prev) => [...prev, streamAssistant]);
          };

          const appendStreamDelta = (delta: string) => {
            if (!delta) return;
            ensureStreamAssistant();
            const currentAssistant = activeStreamAssistantRef.current;
            if (currentAssistant) {
              activeStreamAssistantRef.current = {
                ...currentAssistant,
                content: `${currentAssistant.content}${delta}`,
                typing: true,
              };
            }
            setLocalMessages((prev) =>
              prev.map((item) =>
                String(item.id) === streamAssistantId
                  ? {
                      ...item,
                      content: `${item.content}${delta}`,
                      typing: true,
                    }
                  : item
              )
            );
            setScrollTick((t) => t + 1);
          };

          const setStreamAssistantThinkingLogs = (logs: string[]) => {
            if (logs.length === 0) return;
            ensureStreamAssistant();
            const currentAssistant = activeStreamAssistantRef.current;
            if (currentAssistant) {
              activeStreamAssistantRef.current = {
                ...currentAssistant,
                thinkingLogs: logs,
                typing:
                  currentAssistant.content.trim().length > 0
                    ? currentAssistant.typing
                    : false,
              };
            }
            setAssistantTyping(true);
            setLocalMessages((prev) =>
              prev.map((item) =>
                String(item.id) === streamAssistantId
                  ? {
                      ...item,
                      thinkingLogs: logs,
                      typing:
                        item.content.trim().length > 0 ? item.typing : false,
                    }
                  : item
              )
            );
            setScrollTick((t) => t + 1);
          };

          const appendRecommendationStatusLog = (
            status: CareerRecommendationSearchStatus
          ) => {
            const next = appendRecommendationStatusToActiveLogs(status);
            setStreamAssistantThinkingLogs(next);
          };

          const upsertFinalAssistantMessages = (
            currentMessages: CareerMessage[],
            payloads: CareerMessagePayload[]
          ) => {
            const withoutStreamPlaceholder = currentMessages.filter(
              (message) => String(message.id) !== streamAssistantId
            );

            const merged=payloads.reduce(
              (nextMessages, payload) =>
                replaceMessageById(
                  nextMessages,
                  payload.id,
                  toUiMessage(payload)
                ),
              withoutStreamPlaceholder
            );
            if(payloads.some(p=>p.careerForm||p.applicationActivity||p.applicationDraft||p.simulation||p.simulationSession||p.simulationAction||p.applicationStartOffer)){
              return merged.sort((a,b)=>Number.isFinite(Number(a.id))&&Number.isFinite(Number(b.id))?Number(a.id)-Number(b.id):0);
            }
            return merged;
          };

          const settleAssistantMessage = (payload: CareerMessagePayload) => {
            setLocalMessages((prev) =>
              upsertFinalAssistantMessages(prev, [payload])
            );
            streamAssistantVisible = false;
            activeStreamAssistantIdRef.current = null;
            activeStreamAssistantRef.current = null;
            pendingAssistantMessageId = null;
            setAssistantTyping(false);
            setScrollTick((t) => t + 1);
          };

          const commitStreamMessages = (
            payloads: CareerMessagePayload[] = assistantPayloads
          ) => {
            assistantPayloads = payloads;
            if (!realUserMessage && payloads.length === 0) return;

            const nextKey = [
              realUserMessage?.id ?? "",
              ...payloads.map((payload) => payload.id),
            ].join(":");
            if (nextKey === lastMessagesChangedKey) return;
            lastMessagesChangedKey = nextKey;

            messagesChangedPromise = Promise.resolve(
              onMessagesChanged?.([
                ...(realUserMessage ? [realUserMessage] : []),
                ...payloads,
              ])
            ).catch(() => undefined);
          };

          const refreshOpportunityRecommendations = (
            roleId?: string | null
          ) => {
            if (!onOpportunityRecommendationsChanged) {
              return;
            }

            recommendationRefreshPromise = (
              recommendationRefreshPromise ?? Promise.resolve()
            )
              .then(() => onOpportunityRecommendationsChanged(roleId))
              .catch(() => undefined);
          };

          const handleStreamEvent = async ({
            data,
            event,
          }: CareerChatStreamEvent) => {
            if (!isCurrentRequest() || cancelRequestedRef.current) return;
            if (event === "user_message") {
              const payload = isRecord(data)
                ? toStreamMessagePayload(data.message)
                : null;
              if (!payload) return;
              realUserMessage = payload;
              activeUserMessageRef.current = payload;
              setLocalMessages((prev) =>
                replaceMessageById(prev, tempId, toUiMessage(payload))
              );
              return;
            }

            if ((event === "application_mode" || event === "artifact_message") && isRecord(data) && data.suppressRolePreviews === true) {
              suppressRolePreviews=true;
              if(activeStreamAssistantRef.current) activeStreamAssistantRef.current={...activeStreamAssistantRef.current,suppressRolePreviews:true};
              setLocalMessages(prev=>prev.map(item=>String(item.id)===streamAssistantId?{...item,suppressRolePreviews:true}:item));
              if(event === "application_mode")return;
            }
            if (event === "artifact_message") {
              const payload = isRecord(data) ? toStreamMessagePayload(data.message) : null;
              if (!payload) return;
              setLocalMessages((prev) => replaceMessageById(prev, payload.id, toUiMessage(payload)));
              await onMessagesChanged?.([payload]);
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "text_delta") {
              const delta =
                isRecord(data) && typeof data.delta === "string"
                  ? data.delta
                  : "";
              appendStreamDelta(delta);
              return;
            }

            if (event === "assistant_text_replace") {
              const content =
                isRecord(data) && typeof data.content === "string"
                  ? data.content
                  : "";
              ensureStreamAssistant();
              setAssistantTyping(true);
              const currentAssistant = activeStreamAssistantRef.current;
              if (currentAssistant) {
                activeStreamAssistantRef.current = {
                  ...currentAssistant,
                  content,
                  typing: content.length > 0,
                };
              }
              setLocalMessages((prev) =>
                prev.map((item) =>
                  String(item.id) === streamAssistantId
                    ? {
                        ...item,
                        content,
                        typing: content.length > 0,
                      }
                    : item
                )
              );
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "assistant_text_done") {
              if (isRecord(data) && data.discard === true) {
                setLocalMessages(prev => prev.filter(item => String(item.id) !== streamAssistantId));
                activeStreamAssistantRef.current = null;
                activeStreamAssistantIdRef.current = null;
                pendingAssistantMessageId = null;
                streamAssistantVisible = false;
                setAssistantTyping(false);
                resetActiveThinkingLogs();
                return;
              }
              const currentAssistant = activeStreamAssistantRef.current;
              if (currentAssistant) {
                activeStreamAssistantRef.current = {
                  ...currentAssistant,
                  typing: false,
                };
              }
              setLocalMessages((prev) =>
                prev.map((item) =>
                  String(item.id) === streamAssistantId
                    ? {
                        ...item,
                        typing: false,
                      }
                    : item
                )
              );
              resetActiveThinkingLogs();
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "tool_status") {
              const message =
                isRecord(data) && typeof data.message === "string"
                  ? data.message.trim()
                  : "";
              if (!message) return;
              appendThinkingLog(message);
              setStreamAssistantThinkingLogs(activeThinkingLogsRef.current);
              return;
            }

            if (event === "recommendation_search_status") {
              const status = toRecommendationSearchStatus(data);
              if (!status) return;
              appendRecommendationStatusLog(status);
              if (
                status.state === "completed" &&
                (status.recommendationCount ?? 0) > 0
              ) {
                refreshOpportunityRecommendations();
              }
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "opportunity_recommendations_changed") {
              refreshOpportunityRecommendations(
                isRecord(data) && typeof data.roleId === "string"
                  ? data.roleId
                  : null
              );
              return;
            }

            if (event === "career_coaching_call_ready") {
              const activity =
                isRecord(data) && isRecord(data.activity)
                  ? (data.activity as unknown as CareerCoachingActivity)
                  : null;
              if (activity) {
                await onCareerCoachingCallReady?.(activity);
              }
              return;
            }

            if (event === "recommendation_status_anchor") {
              const contentLength = toRecommendationStatusAnchor(data);
              if (contentLength === null) return;
              ensureStreamAssistant();
              const currentAssistant = activeStreamAssistantRef.current;
              if (currentAssistant) {
                activeStreamAssistantRef.current = {
                  ...currentAssistant,
                  recommendationStatusAfterCharCount: contentLength,
                };
              }
              setLocalMessages((prev) =>
                prev.map((item) =>
                  String(item.id) === streamAssistantId
                    ? {
                        ...item,
                        recommendationStatusAfterCharCount: contentLength,
                      }
                    : item
                )
              );
              return;
            }

            if (event === "onboarding_wrapup_status") {
              const state = isRecord(data) ? data.state : null;
              if (state === "running") {
                setOnboardingWrapupPending(true);
                setScrollTick((t) => t + 1);
                return;
              }
              if (state === "completed" || state === "error") {
                setOnboardingWrapupPending(false);
                setScrollTick((t) => t + 1);
              }
              return;
            }

            if (event === "assistant_progress") {
              const payload = isRecord(data) ? toStreamMessagePayload(data.message) : null;
              if (!payload) return;
              ensureStreamAssistant();
              activeStreamAssistantRef.current = { ...toUiMessage(payload), id: streamAssistantId, typing: false, workPending: true };
              setLocalMessages(prev => prev.map(item => String(item.id) === streamAssistantId
                ? { ...item, ...payload, id: item.id, content: "", typing: false, workPending: true }
                : item));
              return;
            }

            if (event === "assistant_message") {
              const payload = isRecord(data)
                ? toStreamMessagePayload(data.message)
                : null;
              if (!payload) return;
              attachThinkingLogsToMessage(payload.id);
              resetActiveThinkingLogs();
              settleAssistantMessage(payload);
              commitStreamMessages([...assistantPayloads, payload]);
              if (!(isRecord(data) && data.continuing === true)) {
                activeUserMessageRef.current = null;
                setChatPending(false);
              }
              return;
            }

            if (event === "assistant_messages") {
              const payloads =
                isRecord(data) && Array.isArray(data.messages)
                  ? data.messages
                      .map(toStreamMessagePayload)
                      .filter(
                        (item): item is CareerMessagePayload => item !== null
                      )
                  : [];
              if (payloads.length === 0) return;
              attachThinkingLogsToMessage((payloads.find(p=>p.messageType==="chat")??payloads[0]).id);
              resetActiveThinkingLogs();
              setLocalMessages((prev) => {
                return upsertFinalAssistantMessages(prev, payloads);
              });
              streamAssistantVisible = false;
              activeStreamAssistantIdRef.current = null;
              activeStreamAssistantRef.current = null;
              pendingAssistantMessageId = null;
              setAssistantTyping(false);
              commitStreamMessages(payloads);
              activeUserMessageRef.current = null;
              setChatPending(false);
              setScrollTick((t) => t + 1);
              return;
            }

            if (event === "opportunity_run") {
              const run = isRecord(data)
                ? (data.opportunityRun as CareerOpportunityRun | null)
                : null;
              onOpportunityRunChanged?.(run ?? null);
              if (isRecord(data) && data.opportunityDiscoveryQueued === true) {
                showOpportunityDiscoveryStartedToast(
                  tCareer(H.opportunityDiscoveryStarted)
                );
              }
              return;
            }

            if (event === "talent_profile") {
              if (isRecord(data)) {
                syncPreferredLocale(data.preferredLocale);
                if ("talentPreferences" in data) {
                  onTalentPreferencesRefreshed?.(
                    data.talentPreferences,
                    data.preferencesUpdatedAt
                  );
                }
                if ("talentInsights" in data) {
                  onTalentInsightsRefreshed?.(
                    data.talentInsights,
                    data.insightUpdatedAt
                  );
                }
                if ("talentBrief" in data || "talentMemories" in data) {
                  onTalentContextsRefreshed?.({
                    talentBrief: data.talentBrief,
                    talentContextsUpdatedAt:
                      data.talentContextsUpdatedAt ?? data.insightUpdatedAt,
                    talentMemories: data.talentMemories,
                  });
                }
                if ("onboardingChecklistProgress" in data) {
                  onOnboardingChecklistProgressRefreshed?.(
                    data.onboardingChecklistProgress
                  );
                }
                if ("talentProfile" in data) {
                  onTalentProfileRefreshed?.(
                    data.talentProfile as SessionResponse["talentProfile"]
                  );
                }
              }
              return;
            }

            if (event === "progress") {
              const progress = isRecord(data) ? data.progress : null;
              if (isRecord(progress) && progress.completed) {
                setStage("completed");
              }
              return;
            }

            if (event === "error") {
              resetActiveThinkingLogs();
              setOnboardingWrapupPending(false);
              throw new Error(
                isRecord(data) && typeof data.error === "string"
                  ? data.error
                  : tCareer(H.messageSendFailed)
              );
            }

            if (event === "done") {
              if (isRecord(data) && data.stopped === true) {
                cancelRequestedRef.current = true;
                setContinuationMessageId(null);
                markActiveChatStopped();
              }
              if (isRecord(data) && data.continuationQueued === true && activeUserMessageRef.current)
                setContinuationMessageId(activeUserMessageRef.current.id);
              streamDone = true;
              resetActiveThinkingLogs();
              setOnboardingWrapupPending(false);
              if (recommendationRefreshPromise) {
                await recommendationRefreshPromise;
              }
              if (!lastMessagesChangedKey) {
                commitStreamMessages();
              }
              if (messagesChangedPromise) {
                await messagesChangedPromise;
              }
              setChatPending(false);
              setAssistantTyping(false);
              activeStreamAssistantIdRef.current = null;
              activeStreamAssistantRef.current = null;
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (!isCurrentRequest() || cancelRequestedRef.current) {
              // The Stop request owns persistence of the visible partial reply.
              await reader.cancel();
              return;
            }
            if (done) break;

            buffer += decoder
              .decode(value, { stream: true })
              .replace(/\r\n/g, "\n");
            let boundaryIndex = buffer.indexOf("\n\n");
            while (boundaryIndex >= 0) {
              const rawEvent = buffer.slice(0, boundaryIndex);
              buffer = buffer.slice(boundaryIndex + 2);
              const parsedEvent = parseSseEvent(rawEvent);
              if (parsedEvent) {
                await handleStreamEvent(parsedEvent);
              }
              boundaryIndex = buffer.indexOf("\n\n");
            }
          }

          const tail = buffer.trim();
          if (tail) {
            const parsedEvent = parseSseEvent(tail);
            if (parsedEvent) {
              await handleStreamEvent(parsedEvent);
            }
          }

          if (!streamDone) {
            throw new Error(tCareer(H.messageStreamEndedEarly));
          }

          if (!cancelRequestedRef.current) args.onSuccess?.();
          return;
        }

        const payload = await response.json().catch(() => ({}));
        if (!isCurrentRequest()) return;
        if (cancelRequestedRef.current || (isRecord(payload) && payload.stopped === true)) {
          markActiveChatStopped();
          return;
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
        if (isRecord(payload) && "talentPreferences" in payload) {
          onTalentPreferencesRefreshed?.(
            payload.talentPreferences,
            payload.preferencesUpdatedAt
          );
        }
        if (isRecord(payload)) {
          syncPreferredLocale(payload.preferredLocale);
        }
        if (isRecord(payload) && "talentInsights" in payload) {
          onTalentInsightsRefreshed?.(
            payload.talentInsights,
            payload.insightUpdatedAt
          );
        }
        if (
          isRecord(payload) &&
          ("talentBrief" in payload || "talentMemories" in payload)
        ) {
          onTalentContextsRefreshed?.({
            talentBrief: payload.talentBrief,
            talentContextsUpdatedAt:
              payload.talentContextsUpdatedAt ?? payload.insightUpdatedAt,
            talentMemories: payload.talentMemories,
          });
        }
        if (isRecord(payload) && "onboardingChecklistProgress" in payload) {
          onOnboardingChecklistProgressRefreshed?.(
            payload.onboardingChecklistProgress
          );
        }
        if (isRecord(payload) && "talentProfile" in payload) {
          onTalentProfileRefreshed?.(
            payload.talentProfile as SessionResponse["talentProfile"]
          );
        }
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.messageSendFailed))
          );
        }
        if (isRecord(payload?.careerCoachingCallReady)) {
          await onCareerCoachingCallReady?.(
            payload.careerCoachingCallReady as unknown as CareerCoachingActivity
          );
        }
        if (
          payload?.historyShouldRefresh === true &&
          onOpportunityRecommendationsChanged
        ) {
          await Promise.resolve(
            onOpportunityRecommendationsChanged(
              typeof payload.historyChangedRoleId === "string"
                ? payload.historyChangedRoleId
                : null
            )
          ).catch(() => undefined);
        }

        const assistantPayloads = (
          Array.isArray(payload.assistantMessages)
            ? payload.assistantMessages
            : [payload.assistantMessage]
        ).filter(isCareerMessagePayload);
        const userPayload = toStreamMessagePayload(payload.userMessage);

        // Browser-question resumes and duplicate-start acknowledgements may
        // succeed without creating a chat message. Remove the optimistic copy.
        setLocalMessages((prev) =>
          userPayload
            ? replaceMessageById(prev, tempId, toUiMessage(userPayload))
            : prev.filter((message) => message.id !== tempId)
        );
        for (const assistantPayload of assistantPayloads) {
          await enqueueAssistantTypewriter(toUiMessage(assistantPayload));
        }
        setScrollTick((t) => t + 1);
        await onMessagesChanged?.([
          ...(userPayload ? [userPayload] : []),
          ...assistantPayloads,
        ]);

        if (payload?.progress?.completed) {
          setStage("completed");
        }
        args.onSuccess?.();
      } catch (error) {
        if (!isCurrentRequest()) return;
        const wasCancelled =
          cancelRequestedRef.current ||
          abortController.signal.aborted ||
          isAbortLikeError(error);
        if (wasCancelled) {
          markActiveChatStopped();
          return;
        }

        resetActiveThinkingLogs();
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.messageSendUnexpected);
        setLocalMessages((prev) =>
          prev.filter(
            (item) =>
              (Boolean(args.formResponseMessageId) || item.id !== tempId) &&
              (!pendingAssistantMessageId ||
                String(item.id) !== pendingAssistantMessageId || item.workEvents !== undefined)
          ).map(item => String(item.id) === pendingAssistantMessageId && item.workEvents !== undefined
            ? { ...item, typing: false, workPending: false, workCompletedAt: item.workCompletedAt ?? new Date().toISOString() }
            : item)
        );
        activeStreamAssistantIdRef.current = null;
        activeStreamAssistantRef.current = null;
        setAssistantTyping(false);
        setChatError(message);
        args.onError?.();
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (isCurrentRequest()) {
          if (
            !explicitConversationStarterId &&
            activeConversationStarterId &&
            activeConversationStarterId !== "career_coaching" &&
            activeConversationStarterRef.current?.starterId ===
              activeConversationStarterId
          ) {
            const remainingFollowUpTurns =
              activeConversationStarterRef.current.remainingFollowUpTurns - 1;
            activeConversationStarterRef.current =
              remainingFollowUpTurns > 0
                ? {
                    ...activeConversationStarterRef.current,
                    remainingFollowUpTurns,
                  }
                : null;
          }
          if (!cancellationSavePendingRef.current) {
            setChatPending(false);
          }
        }
      }
    },
    [
      appendThinkingLog,
      appendRecommendationStatusToActiveLogs,
      isOnboardingDone,
      hasActiveInputTurn,
      attachThinkingLogsToMessage,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      locale,
      markActiveChatStopped,
      sessionPending,
      stage,
      syncPreferredLocale,
      user,
      onMessagesChanged,
      onRequestAdmitted,
      onCareerCoachingCallReady,
      onOpportunityRunChanged,
      onOpportunityRecommendationsChanged,
      onOnboardingChecklistProgressRefreshed,
      onTalentInsightsRefreshed,
      onTalentContextsRefreshed,
      onTalentPreferencesRefreshed,
      onTalentProfileRefreshed,
      resetActiveThinkingLogs,
      tCareer,
      textChatModel,
      promptVariant,
      conversationVersion,
    ]
  );

  const executeChatMessageRef = useRef(executeChatMessage);
  useEffect(() => { executeChatMessageRef.current = executeChatMessage; }, [executeChatMessage]);

  const sendChatMessage = useCallback((args: SendChatArgs, options?: SendChatOptions) => {
    const durable = (isOnboardingDone || stage === "completed") && args.channel !== "voice";
    if (!inlineSendQueue.current && durable) return executeChatMessage(args, options);
    if (!user || !conversationId || sessionPending || stage === "profile" || options?.profilePending || cancellationSavePendingRef.current)
      return executeChatMessage(args, options);
    if (!args.text.trim() && !args.files?.length && !args.formResponseMessageId && !args.internalCallAnswerSubmission)
      return Promise.resolve();

    // Legacy onboarding streams share one controller. Accept extra input now,
    // then run it in order after the prior response and its persistence finish.
    let queued: QueuedChatMessage | undefined;
    if (inlineSendQueue.current) {
      const clientRequestId = crypto.randomUUID();
      const queuedMessage = { clientRequestId, tempId: `temp-user-${clientRequestId}`,
        createdAt: new Date().toISOString(), conversationId, stopped: false };
      queued = queuedMessage;
      queuedMessages.current.set(clientRequestId, queuedMessage);
      setQueuedMessageConversations(current => ({ ...current, [clientRequestId]: conversationId }));
      if (!args.formResponseMessageId && !args.internalCallAnswerSubmission) {
        const text = args.text.trim() || args.files?.map(file => file.name).join(", ") || "";
        setLocalMessages(current => [...current, { id: queuedMessage.tempId, clientRequestId, role: "user", inputPending: true,
          content: args.link?.trim() ? `${text}\n\n${tCareer(H.referenceLink, { link: args.link.trim() })}` : text,
          attachments: args.files?.map(file => ({ name: file.name, mime: file.type || undefined, size: file.size })),
          messageType: args.messageType ?? "chat", opportunityMentions: args.opportunityMentions, createdAt: queuedMessage.createdAt }]);
        setSentMessageTick(tick => tick + 1);
      }
    }
    const run = async () => {
      if (stopRequest.current) await stopRequest.current;
      if (queued) {
        const requestId = queued.clientRequestId;
        queuedMessages.current.delete(requestId);
        if (mountedRef.current) setQueuedMessageConversations(current => {
          const next = { ...current };
          delete next[requestId];
          return next;
        });
      }
      if (!mountedRef.current || currentConversationRef.current !== conversationId || queued?.stopped) return;
      await executeChatMessageRef.current(args, options, queued);
    };
    const pending = inlineSendQueue.current ? inlineSendQueue.current.then(run, run) : run();
    const settled = pending.finally(() => {
      if (inlineSendQueue.current === settled) inlineSendQueue.current = null;
    });
    inlineSendQueue.current = settled;
    return settled;
  }, [conversationId, executeChatMessage, isOnboardingDone, sessionPending, stage, tCareer, user]);

  const [mergeMessages] = useState(createCareerMessageMerger);
  const messages = useMemo(
    () => mergeMessages(persistedMessages, localMessages),
    [localMessages, persistedMessages, mergeMessages]
  );

  const resetChatState = useCallback(() => {
    activeClientRequestIdRef.current = null;
    activeOptimisticMessageIdRef.current = null;
    activeUserMessageRef.current = null;
    activeStreamAssistantIdRef.current = null;
    activeStreamAssistantRef.current = null;
    cancellationSavePendingRef.current = false;
    cancelRequestedRef.current = false;
    for (const queued of queuedMessages.current.values()) queued.stopped = true;
    queuedMessages.current.clear();
    setQueuedMessageConversations({});
    inlineSendQueue.current = null;
    stopRequest.current = null;
    setStage("profile");
    setLocalMessages([]);
    setChatPending(false);
    setContinuationMessageId(null);
    setChatError("");
    setAssistantTyping(false);
    setOnboardingWrapupPending(false);
    resetActiveThinkingLogs();
    setThinkingLogsByMessageId({});
  }, [resetActiveThinkingLogs]);

  const queuedMessagePending = Object.values(queuedMessageConversations).includes(conversationId ?? "");

  return {
    stage,
    setStage,
    messages,
    scrollTick,
    sentMessageTick,
    appendMessage,
    removeMessages,
    chatPending,
    chatAdmissionPending: queuedMessagePending || Boolean(conversationId && admissions[conversationId]),
    canStopChat: chatPending || queuedMessagePending || continuationPending || hasDurableWork || messages.some(message => String(message.id).startsWith("live:") && message.workPending !== false) || Boolean(conversationId && admissions[conversationId]) || stopPending,
    stopPending,
    toolStatusMessage,
    activeThinkingLogs,
    activeRecommendationSearchStatus,
    onboardingWrapupPending,
    thinkingLogsByMessageId,
    chatError,
    setChatError,
    assistantTyping,
    enqueueAssistantTypewriter,
    applySessionConversation,
    cancelActiveRecommendationSearch: cancelActiveChat,
    cancelActiveChat,
    sendChatMessage,
    regenerateOnboardingWrapup,
    resetChatState,
  };
};
