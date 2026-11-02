import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "@/components/career/types";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { visibleReengagementStreamText } from "@/lib/career/reengagementStreamText";
import { getCareerBrowserTimeZone } from "@/lib/career/requestTimeZone";

export type SessionReengagementPayload = {
  assistantMessage?: CareerMessagePayload | null;
  assistantMessages?: CareerMessagePayload[];
  deletedMessageIds?: number[];
  insightUpdatedAt?: unknown;
  hiddenExpiredExternalOpportunityCount?: unknown;
  opportunityRun?: CareerOpportunityRun | null;
  preferencesUpdatedAt?: unknown;
  skipped?: boolean;
  talentInsights?: unknown;
  talentBrief?: unknown;
  talentContextsUpdatedAt?: unknown;
  talentMemories?: unknown;
  talentPreferences?: unknown;
};

type CareerSseEvent = {
  data: unknown;
  event: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseCareerSseEvent = (rawEvent: string): CareerSseEvent | null => {
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

export type CareerSessionReengagementState = {
  actionMessageId: string | null;
  actionVersionRef: MutableRefObject<number>;
  appendThinkingLog: (message: string) => void;
  automaticRunRef: MutableRefObject<string | null>;
  clearAction: () => void;
  clearStream: () => void;
  pending: boolean;
  streamMessage: CareerMessage | null;
  readResponse: (
    response: Response,
    onMessages: (messages: CareerMessagePayload[]) => void,
    isActive?: () => boolean
  ) => Promise<SessionReengagementPayload>;
  recommendationStatus: CareerRecommendationSearchStatus | null;
  setActionMessageId: Dispatch<SetStateAction<string | null>>;
  setPending: Dispatch<SetStateAction<boolean>>;
  setRecommendationStatus: Dispatch<
    SetStateAction<CareerRecommendationSearchStatus | null>
  >;
  setThinkingLogs: Dispatch<SetStateAction<string[]>>;
  thinkingLogs: string[];
};

export const useCareerSessionReengagementState =
  (): CareerSessionReengagementState => {
    const t = useCareerT();
    const automaticRunRef = useRef<string | null>(null);
    const actionVersionRef = useRef(0);
    const [actionMessageId, setActionMessageId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [streamMessage, setStreamMessage] = useState<CareerMessage | null>(
      null
    );
    const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
    const [recommendationStatus, setRecommendationStatus] =
      useState<CareerRecommendationSearchStatus | null>(null);

    const clearStream = useCallback(() => {
      actionVersionRef.current += 1;
      setPending(false);
      setStreamMessage(null);
      setThinkingLogs([]);
      setRecommendationStatus(null);
    }, []);

    const clearAction = useCallback(() => {
      clearStream();
      setActionMessageId(null);
    }, [clearStream]);

    const appendThinkingLog = useCallback((message: string) => {
      const normalized = message.replace(/\s+/g, " ").trim();
      if (!normalized) return;

      setThinkingLogs((current) =>
        current[current.length - 1] === normalized
          ? current
          : [...current, normalized].slice(-12)
      );
    }, []);

    const readResponse = useCallback(
      async (
        response: Response,
        onMessages: (messages: CareerMessagePayload[]) => void,
        isActive: () => boolean = () => true
      ): Promise<SessionReengagementPayload> => {
        const version = actionVersionRef.current;
        const active = () => isActive() && version === actionVersionRef.current;
        const commit = (messages: CareerMessagePayload[]) => {
          if (!active()) return;
          setStreamMessage(null);
          onMessages(messages);
        };
        if (
          !response.ok ||
          !response.body ||
          !response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          const payload = await response.json().catch(() => ({}));
          if (response.ok && !payload.skipped) {
            commit(
              payload.assistantMessages ??
                (payload.assistantMessage ? [payload.assistantMessage] : [])
            );
          }
          return payload;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamDone = false;
        let result: SessionReengagementPayload | undefined;
        let rawText = "";

        const handleStreamEvent = async ({ data, event }: CareerSseEvent) => {
          if (!active()) return;
          if (event === "text_delta") {
            if (!isRecord(data) || typeof data.delta !== "string") return;
            rawText += data.delta;
            const content = visibleReengagementStreamText(rawText);
            if (content)
              setStreamMessage((current) => ({
                ...(current ?? {
                  id: `reengagement-stream:${crypto.randomUUID()}`,
                  role: "assistant" as const,
                  messageType: "chat",
                  createdAt: new Date().toISOString(),
                }),
                content,
                typing: true,
                typingMode: "stream",
              }));
            return;
          }
          if (event === "assistant_message") {
            if (isRecord(data) && isRecord(data.message)) {
              commit([data.message as CareerMessagePayload]);
              rawText = "";
              setThinkingLogs([]);
            }
            return;
          }
          if (event === "tool_status") {
            const message =
              isRecord(data) && typeof data.message === "string"
                ? data.message
                : "";
            appendThinkingLog(message);
            return;
          }

          if (event === "recommendation_search_status") {
            const status = toRecommendationSearchStatus(data);
            if (status) {
              setRecommendationStatus(status);
            }
            return;
          }

          if (event === "reengagement_result") {
            result = data as SessionReengagementPayload;
            commit(
              result.assistantMessages ??
                (result.assistantMessage ? [result.assistantMessage] : [])
            );
            return;
          }

          if (event === "error") {
            throw new Error(
              isRecord(data) && typeof data.error === "string"
                ? data.error
                : t(
                    "career.common.career_flow_provider.0750gye",
                    "12시간 인사 생성에 실패했습니다."
                  )
            );
          }

          if (event === "done") {
            streamDone = true;
          }
        };

        try {
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
              const parsedEvent = parseCareerSseEvent(rawEvent);
              if (parsedEvent) {
                await handleStreamEvent(parsedEvent);
              }
              boundaryIndex = buffer.indexOf("\n\n");
            }
          }

          const tail = buffer.trim();
          if (tail) {
            const parsedEvent = parseCareerSseEvent(tail);
            if (parsedEvent) {
              await handleStreamEvent(parsedEvent);
            }
          }

          if (active() && (!streamDone || !result)) {
            throw new Error(
              t(
                "career.common.career_flow_provider.06f4hcx",
                "12시간 인사 스트림이 완료되기 전에 종료되었습니다."
              )
            );
          }
          return result ?? { skipped: true };
        } finally {
          reader.releaseLock();
          if (active()) setStreamMessage(null);
        }
      },
      [appendThinkingLog, t]
    );

    return {
      actionMessageId,
      actionVersionRef,
      appendThinkingLog,
      automaticRunRef,
      clearAction,
      clearStream,
      pending,
      readResponse,
      streamMessage,
      recommendationStatus,
      setActionMessageId,
      setPending,
      setRecommendationStatus,
      setThinkingLogs,
      thinkingLogs,
    };
  };

export const useCareerAutomaticSessionReengagement = ({
  conversationId,
  appendAssistantMessages,
  fetchWithAuth,
  onOpportunityRunChanged,
  onHistoryOpportunitiesChanged,
  onTalentInsightsRefreshed,
  onTalentContextsRefreshed,
  onTalentPreferencesRefreshed,
  sessionPending,
  stage,
  state,
  userId,
}: {
  conversationId: string | null;
  appendAssistantMessages: (messages: CareerMessagePayload[]) => void;
  fetchWithAuth: FetchWithAuth;
  onOpportunityRunChanged: (run: CareerOpportunityRun | null) => void;
  onHistoryOpportunitiesChanged: () => void | Promise<void>;
  onTalentInsightsRefreshed: (insights: unknown, updatedAt: unknown) => void;
  onTalentContextsRefreshed: (payload: {
    talentBrief?: unknown;
    talentContextsUpdatedAt?: unknown;
    talentMemories?: unknown;
  }) => void;
  onTalentPreferencesRefreshed: (
    preferences: unknown,
    updatedAt: unknown
  ) => void;
  sessionPending: boolean;
  stage: CareerStage;
  state: CareerSessionReengagementState;
  userId: string | null;
}) => {
  const {
    actionVersionRef,
    readResponse,
    automaticRunRef,
    clearAction,
    clearStream,
    setActionMessageId,
    setPending,
    setRecommendationStatus,
    setThinkingLogs,
  } = state;

  useEffect(() => {
    if (!userId || !conversationId || sessionPending || stage === "profile") {
      return;
    }

    const reengagementKey = `${userId}:${conversationId}`;
    if (automaticRunRef.current === reengagementKey) return;
    automaticRunRef.current = reengagementKey;
    clearAction();
    const reengagementActionVersion = actionVersionRef.current;
    const isCurrentAction = () =>
      actionVersionRef.current === reengagementActionVersion;

    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const applyReengagementPayload = async (
      payload: SessionReengagementPayload
    ) => {
      if (
        cancelled ||
        actionVersionRef.current !== reengagementActionVersion ||
        payload.skipped
      )
        return;

      if (payload.opportunityRun) {
        onOpportunityRunChanged(payload.opportunityRun);
      }
      if (
        typeof payload.hiddenExpiredExternalOpportunityCount === "number" &&
        payload.hiddenExpiredExternalOpportunityCount > 0
      ) {
        await onHistoryOpportunitiesChanged();
      }
      if ("talentPreferences" in payload) {
        onTalentPreferencesRefreshed(
          payload.talentPreferences,
          payload.preferencesUpdatedAt ?? null
        );
      }
      if ("talentInsights" in payload) {
        onTalentInsightsRefreshed(
          payload.talentInsights,
          payload.insightUpdatedAt ?? null
        );
      }
      if ("talentBrief" in payload || "talentMemories" in payload) {
        onTalentContextsRefreshed({
          talentBrief: payload.talentBrief,
          talentContextsUpdatedAt:
            payload.talentContextsUpdatedAt ?? payload.insightUpdatedAt,
          talentMemories: payload.talentMemories,
        });
      }

      const assistantMessages = Array.isArray(payload.assistantMessages)
        ? payload.assistantMessages
        : payload.assistantMessage
          ? [payload.assistantMessage]
          : [];

      if (assistantMessages.length > 0) {
        if (
          !cancelled &&
          actionVersionRef.current === reengagementActionVersion
        ) {
          setPending(false);
          setThinkingLogs([]);
          setRecommendationStatus(null);
        }
        if (
          !cancelled &&
          actionVersionRef.current === reengagementActionVersion
        ) {
          const lastAssistantMessage =
            assistantMessages[assistantMessages.length - 1];
          setActionMessageId(String(lastAssistantMessage.id));
        }
      }
    };

    const triggerReengagement = async () => {
      pendingTimer = setTimeout(() => {
        if (
          !cancelled &&
          actionVersionRef.current === reengagementActionVersion
        ) {
          setPending(true);
        }
      }, 300);

      try {
        const response = await fetchWithAuth(
          "/api/talent/session/reengagement",
          {
            method: "POST",
            headers: {
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              conversationId,
              timeZone: getCareerBrowserTimeZone(),
            }),
          }
        );

        const payload = await readResponse(
          response,
          appendAssistantMessages,
          () =>
            !cancelled && actionVersionRef.current === reengagementActionVersion
        );

        if (!response.ok || cancelled || payload.skipped) return;
        await applyReengagementPayload(payload);
      } catch (error) {
        console.error("[CareerFlowProvider] session re-engagement failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (pendingTimer) {
          clearTimeout(pendingTimer);
        }
        if (
          !cancelled &&
          actionVersionRef.current === reengagementActionVersion
        ) {
          setPending(false);
          setThinkingLogs([]);
          setRecommendationStatus(null);
        }
      }
    };

    void triggerReengagement();

    return () => {
      cancelled = true;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
      if (isCurrentAction()) clearStream();
    };
  }, [
    actionVersionRef,
    readResponse,
    automaticRunRef,
    clearAction,
    clearStream,
    conversationId,
    appendAssistantMessages,
    fetchWithAuth,
    onOpportunityRunChanged,
    onHistoryOpportunitiesChanged,
    onTalentInsightsRefreshed,
    onTalentContextsRefreshed,
    onTalentPreferencesRefreshed,
    sessionPending,
    setActionMessageId,
    setPending,
    setRecommendationStatus,
    setThinkingLogs,
    stage,
    userId,
  ]);
};
