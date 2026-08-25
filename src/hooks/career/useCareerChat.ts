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

type SendChatArgs = {
  allowedToolNames?: readonly string[];
  files?: File[];
  channel?: "chat" | "voice";
  conversationStarterId?: CareerConversationStarterId;
  text: string;
  link?: string;
  messageType?: TalentUserChatMessageType;
  opportunityMentions?: CareerOpportunityMention[];
  pendingAction?: CareerPendingActionReference;
  onError?: () => void;
};

type SendChatOptions = {
  profilePending?: boolean;
};

type CareerChatStreamEvent = {
  data: unknown;
  event: string;
};

type UseCareerChatArgs = {
  user: User | null;
  conversationId: string | null;
  sessionPending: boolean;
  fetchWithAuth: FetchWithAuth;
  onOpportunityRunChanged?: (run: CareerOpportunityRun | null) => void;
  onOpportunityRecommendationsChanged?: (
    roleId?: string | null
  ) => void | Promise<void>;
  onTalentPreferencesRefreshed?: (
    preferences: unknown,
    updatedAt: unknown
  ) => void;
  onTalentInsightsRefreshed?: (insights: unknown, updatedAt: unknown) => void;
  onTalentProfileRefreshed?: (
    profile: SessionResponse["talentProfile"] | undefined
  ) => void;
  persistedMessages: CareerMessage[];
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
};

const mergeMessages = (
  persistedMessages: CareerMessage[],
  localMessages: CareerMessage[]
) => {
  if (localMessages.length === 0) return persistedMessages;

  const merged = [...persistedMessages];
  const persistedIndexById = new Map<string, number>();
  const rebuildIndex = () => {
    persistedIndexById.clear();
    for (let index = 0; index < merged.length; index += 1) {
      persistedIndexById.set(String(merged[index].id), index);
    }
  };

  rebuildIndex();

  let nextLocalInsertIndex = merged.length;

  for (const message of localMessages) {
    const id = String(message.id);
    const existingIndex = persistedIndexById.get(id);
    if (typeof existingIndex === "number") {
      if (message.typing || (message.thinkingLogs?.length ?? 0) > 0) {
        merged[existingIndex] = {
          ...merged[existingIndex],
          ...message,
        };
      }
      nextLocalInsertIndex = existingIndex + 1;
      rebuildIndex();
      continue;
    }

    const insertIndex = Math.min(nextLocalInsertIndex, merged.length);
    merged.splice(insertIndex, 0, message);
    nextLocalInsertIndex = insertIndex + 1;
    rebuildIndex();
  }

  return merged;
};

const replaceMessageById = (
  messages: CareerMessage[],
  targetId: string | number,
  nextMessage: CareerMessage
) => {
  const targetKey = String(targetId);
  const nextIndex = messages.findIndex(
    (message) => String(message.id) === targetKey
  );

  if (nextIndex < 0) {
    return [...messages, nextMessage];
  }

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
  user,
  conversationId,
  sessionPending,
  fetchWithAuth,
  onOpportunityRunChanged,
  onOpportunityRecommendationsChanged,
  onTalentPreferencesRefreshed,
  onTalentInsightsRefreshed,
  onTalentProfileRefreshed,
  persistedMessages,
  onMessagesChanged,
}: UseCareerChatArgs) => {
  const tCareer = useCareerMessageFormatter();
  const { locale, setLocale } = useMessages();
  const [stage, setStage] = useState<CareerStage>("profile");
  const [localMessages, setLocalMessages] = useState<CareerMessage[]>([]);
  const [chatPending, setChatPending] = useState(false);
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

  const activeThinkingLogsRef = useRef<string[]>([]);
  const activeConversationStarterRef = useRef<{
    remainingFollowUpTurns: number;
    starterId: CareerConversationStarterId;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeStreamAssistantIdRef = useRef<string | null>(null);
  const activeUserMessageRef = useRef<CareerMessagePayload | null>(null);
  const cancellationSavePendingRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const typingQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

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

  const markActiveRecommendationSearchStopped = useCallback(() => {
    const stoppedStatus: CareerRecommendationSearchStatus = {
      state: "stopped",
    };
    const logs = appendRecommendationStatusToActiveLogs(stoppedStatus);
    const streamAssistantId = activeStreamAssistantIdRef.current;
    const activeUserMessage = activeUserMessageRef.current;
    const stoppedUserMessage = activeUserMessage
      ? {
          ...activeUserMessage,
          thinkingLogs: upsertRecommendJobPostingStatusLog(
            activeUserMessage.thinkingLogs,
            stoppedStatus
          ),
        }
      : null;

    if (stoppedUserMessage) {
      activeUserMessageRef.current = stoppedUserMessage;
      setLocalMessages((prev) =>
        replaceMessageById(
          prev.filter(
            (item) => String(item.id) !== String(streamAssistantId ?? "")
          ),
          stoppedUserMessage.id,
          toUiMessage(stoppedUserMessage)
        )
      );
    } else if (streamAssistantId) {
      setLocalMessages((prev) =>
        prev.map((item) =>
          String(item.id) === streamAssistantId
            ? {
                ...item,
                thinkingLogs: logs,
                typing: false,
              }
            : item
        )
      );
    }

    activeStreamAssistantIdRef.current = null;
    setAssistantTyping(false);
    setOnboardingWrapupPending(false);
    setScrollTick((t) => t + 1);
    return stoppedUserMessage;
  }, [appendRecommendationStatusToActiveLogs]);

  const cancelActiveRecommendationSearch = useCallback(() => {
    if (cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    cancellationSavePendingRef.current = true;
    const stoppedUserMessage = markActiveRecommendationSearchStopped();
    abortControllerRef.current?.abort();

    if (!conversationId || !stoppedUserMessage) {
      cancellationSavePendingRef.current = false;
      setChatPending(false);
      return;
    }

    void (async () => {
      try {
        const response = await fetchWithAuth("/api/talent/chat/stop", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            userMessageId: stoppedUserMessage.id,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.messageSendFailed))
          );
        }
        const updatedUserMessage = isRecord(payload)
          ? toStreamMessagePayload(payload.userMessage)
          : null;
        if (!updatedUserMessage) {
          throw new Error(tCareer(H.messageSendFailed));
        }

        activeUserMessageRef.current = updatedUserMessage;
        setLocalMessages((prev) =>
          replaceMessageById(
            prev,
            updatedUserMessage.id,
            toUiMessage(updatedUserMessage)
          )
        );
        await Promise.resolve(onMessagesChanged?.([updatedUserMessage])).catch(
          () => undefined
        );
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : tCareer(H.messageSendUnexpected)
        );
      } finally {
        cancellationSavePendingRef.current = false;
        activeUserMessageRef.current = null;
        setChatPending(false);
      }
    })();
  }, [
    conversationId,
    fetchWithAuth,
    markActiveRecommendationSearchStopped,
    onMessagesChanged,
    tCareer,
  ]);

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
    setLocalMessages([]);
    activeConversationStarterRef.current = null;
    activeUserMessageRef.current = null;
    cancellationSavePendingRef.current = false;
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

  const sendChatMessage = useCallback(
    async (args: SendChatArgs, options?: SendChatOptions) => {
      if (
        !user ||
        !conversationId ||
        sessionPending ||
        stage === "profile" ||
        options?.profilePending ||
        chatPending ||
        assistantTyping
      ) {
        return;
      }

      const text = args.text.trim();
      const link = (args.link ?? "").trim();
      const files = (args.files ?? []).slice(0, 5);
      if (!text && files.length === 0) return;

      const explicitConversationStarterId = args.conversationStarterId;
      if (explicitConversationStarterId) {
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
      const tempId = `temp-user-${Date.now()}`;
      const nowIso = new Date().toISOString();

      setChatError("");
      resetActiveThinkingLogs();
      cancelRequestedRef.current = false;
      cancellationSavePendingRef.current = false;
      activeUserMessageRef.current = null;
      setChatPending(true);
      setLocalMessages((prev) => [
        ...prev,
        {
          attachments: optimisticAttachments,
          id: tempId,
          role: "user",
          content: composed,
          messageType,
          createdAt: nowIso,
        },
      ]);

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

        const response = await fetchWithAuth("/api/talent/chat", {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
          },
          signal: abortController.signal,
          body: JSON.stringify({
            allowedToolNames: args.allowedToolNames,
            channel: args.channel ?? "chat",
            conversationStarterId: activeConversationStarterId,
            conversationId,
            locale,
            message: text,
            messageType,
            opportunityMentions: args.opportunityMentions,
            pendingAction: args.pendingAction,
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

          const ensureStreamAssistant = () => {
            if (streamAssistantVisible) return;
            streamAssistantVisible = true;
            activeStreamAssistantIdRef.current = streamAssistantId;
            setAssistantTyping(true);
            setLocalMessages((prev) => [
              ...prev,
              {
                id: streamAssistantId,
                role: "assistant",
                content: "",
                messageType: "chat",
                createdAt: new Date().toISOString(),
                typing: true,
              },
            ]);
          };

          const appendStreamDelta = (delta: string) => {
            if (!delta) return;
            ensureStreamAssistant();
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

            return payloads.reduce(
              (nextMessages, payload) =>
                replaceMessageById(
                  nextMessages,
                  payload.id,
                  toUiMessage(payload)
                ),
              withoutStreamPlaceholder
            );
          };

          const settleAssistantMessage = (payload: CareerMessagePayload) => {
            setLocalMessages((prev) =>
              upsertFinalAssistantMessages(prev, [payload])
            );
            streamAssistantVisible = false;
            activeStreamAssistantIdRef.current = null;
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

            if (event === "recommendation_status_anchor") {
              const contentLength = toRecommendationStatusAnchor(data);
              if (contentLength === null) return;
              ensureStreamAssistant();
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

            if (event === "assistant_message") {
              const payload = isRecord(data)
                ? toStreamMessagePayload(data.message)
                : null;
              if (!payload) return;
              attachThinkingLogsToMessage(payload.id);
              resetActiveThinkingLogs();
              settleAssistantMessage(payload);
              commitStreamMessages([payload]);
              activeUserMessageRef.current = null;
              setChatPending(false);
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
              attachThinkingLogsToMessage(payloads[0].id);
              resetActiveThinkingLogs();
              setLocalMessages((prev) => {
                return upsertFinalAssistantMessages(prev, payloads);
              });
              streamAssistantVisible = false;
              activeStreamAssistantIdRef.current = null;
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
            }
          };

          while (true) {
            const { done, value } = await reader.read();
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

          return;
        }

        const payload = await response.json().catch(() => ({}));
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

        const assistantPayloads = Array.isArray(payload.assistantMessages)
          ? (payload.assistantMessages as CareerMessagePayload[])
          : payload.assistantMessage
            ? [payload.assistantMessage as CareerMessagePayload]
            : [];

        setLocalMessages((prev) =>
          replaceMessageById(prev, tempId, toUiMessage(payload.userMessage))
        );
        for (const assistantPayload of assistantPayloads) {
          await enqueueAssistantTypewriter(toUiMessage(assistantPayload));
        }
        setScrollTick((t) => t + 1);
        await onMessagesChanged?.([
          payload.userMessage as CareerMessagePayload,
          ...assistantPayloads,
        ]);

        if (payload?.progress?.completed) {
          setStage("completed");
        }
      } catch (error) {
        const wasCancelled =
          cancelRequestedRef.current ||
          abortController.signal.aborted ||
          isAbortLikeError(error);
        if (wasCancelled) {
          markActiveRecommendationSearchStopped();
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
              item.id !== tempId &&
              (!pendingAssistantMessageId ||
                String(item.id) !== pendingAssistantMessageId)
          )
        );
        activeStreamAssistantIdRef.current = null;
        setChatError(message);
        args.onError?.();
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (
          !explicitConversationStarterId &&
          activeConversationStarterId &&
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
    },
    [
      appendThinkingLog,
      appendRecommendationStatusToActiveLogs,
      assistantTyping,
      attachThinkingLogsToMessage,
      chatPending,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      locale,
      markActiveRecommendationSearchStopped,
      sessionPending,
      stage,
      syncPreferredLocale,
      user,
      onMessagesChanged,
      onOpportunityRunChanged,
      onOpportunityRecommendationsChanged,
      onTalentInsightsRefreshed,
      onTalentPreferencesRefreshed,
      onTalentProfileRefreshed,
      resetActiveThinkingLogs,
      tCareer,
    ]
  );

  const messages = useMemo(
    () => mergeMessages(persistedMessages, localMessages),
    [localMessages, persistedMessages]
  );

  const resetChatState = useCallback(() => {
    activeUserMessageRef.current = null;
    cancellationSavePendingRef.current = false;
    cancelRequestedRef.current = false;
    setStage("profile");
    setLocalMessages([]);
    setChatPending(false);
    setChatError("");
    setAssistantTyping(false);
    setOnboardingWrapupPending(false);
    resetActiveThinkingLogs();
    setThinkingLogsByMessageId({});
  }, [resetActiveThinkingLogs]);

  return {
    stage,
    setStage,
    messages,
    scrollTick,
    appendMessage,
    chatPending,
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
    cancelActiveRecommendationSearch,
    sendChatMessage,
    regenerateOnboardingWrapup,
    resetChatState,
  };
};
