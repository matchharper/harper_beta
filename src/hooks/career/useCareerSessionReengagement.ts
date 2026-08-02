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
  CareerMessagePayload,
  CareerOpportunityRun,
  CareerRecommendationSearchStatus,
  CareerStage,
} from "@/components/career/types";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";

export type SessionReengagementPayload = {
  assistantMessage?: CareerMessagePayload | null;
  assistantMessages?: CareerMessagePayload[];
  deletedMessage?: {
    id?: number | string | null;
    message_type?: string | null;
    role?: string | null;
  } | null;
  insightUpdatedAt?: unknown;
  opportunityRun?: CareerOpportunityRun | null;
  preferencesUpdatedAt?: unknown;
  skipped?: boolean;
  talentInsights?: unknown;
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
  pending: boolean;
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
    const automaticRunRef = useRef<string | null>(null);
    const actionVersionRef = useRef(0);
    const [actionMessageId, setActionMessageId] = useState<string | null>(null);
    const [pending, setPending] = useState(false);
    const [thinkingLogs, setThinkingLogs] = useState<string[]>([]);
    const [recommendationStatus, setRecommendationStatus] =
      useState<CareerRecommendationSearchStatus | null>(null);

    const clearAction = useCallback(() => {
      actionVersionRef.current += 1;
      setPending(false);
      setThinkingLogs([]);
      setRecommendationStatus(null);
      setActionMessageId(null);
    }, []);

    const appendThinkingLog = useCallback((message: string) => {
      const normalized = message.replace(/\s+/g, " ").trim();
      if (!normalized) return;

      setThinkingLogs((current) =>
        current[current.length - 1] === normalized
          ? current
          : [...current, normalized].slice(-12)
      );
    }, []);

    return {
      actionMessageId,
      actionVersionRef,
      appendThinkingLog,
      automaticRunRef,
      clearAction,
      pending,
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
  enqueueAssistantMessages,
  fetchWithAuth,
  onOpportunityRunChanged,
  onTalentInsightsRefreshed,
  onTalentPreferencesRefreshed,
  sessionPending,
  stage,
  state,
  userId,
}: {
  conversationId: string | null;
  enqueueAssistantMessages: (rawMessages: unknown[]) => Promise<void>;
  fetchWithAuth: FetchWithAuth;
  onOpportunityRunChanged: (run: CareerOpportunityRun | null) => void;
  onTalentInsightsRefreshed: (insights: unknown, updatedAt: unknown) => void;
  onTalentPreferencesRefreshed: (
    preferences: unknown,
    updatedAt: unknown
  ) => void;
  sessionPending: boolean;
  stage: CareerStage;
  state: CareerSessionReengagementState;
  userId: string | null;
}) => {
  const t = useCareerT();
  const {
    actionVersionRef,
    appendThinkingLog,
    automaticRunRef,
    clearAction,
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

    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;

    const applyReengagementPayload = async (
      payload: SessionReengagementPayload
    ) => {
      if (cancelled || payload.skipped) return;

      if (payload.opportunityRun) {
        onOpportunityRunChanged(payload.opportunityRun);
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

      const assistantMessages = Array.isArray(payload.assistantMessages)
        ? payload.assistantMessages
        : payload.assistantMessage
          ? [payload.assistantMessage]
          : [];

      if (assistantMessages.length > 0) {
        if (!cancelled) {
          setPending(false);
          setThinkingLogs([]);
          setRecommendationStatus(null);
        }
        await enqueueAssistantMessages(assistantMessages);
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

    const consumeReengagementStream = async (response: Response) => {
      if (!response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;

      const handleStreamEvent = async ({ data, event }: CareerSseEvent) => {
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
          await applyReengagementPayload(data as SessionReengagementPayload);
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

      if (!streamDone) {
        throw new Error(
          t(
            "career.common.career_flow_provider.06f4hcx",
            "12시간 인사 스트림이 완료되기 전에 종료되었습니다."
          )
        );
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
            body: JSON.stringify({ conversationId }),
          }
        );

        const contentType = response.headers.get("content-type") ?? "";
        if (
          response.ok &&
          response.body &&
          contentType.includes("text/event-stream")
        ) {
          await consumeReengagementStream(response);
          return;
        }

        const payload = (await response
          .json()
          .catch(() => ({}))) as SessionReengagementPayload;

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
        if (!cancelled) {
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
      setPending(false);
      setThinkingLogs([]);
      setRecommendationStatus(null);
    };
  }, [
    actionVersionRef,
    appendThinkingLog,
    automaticRunRef,
    clearAction,
    conversationId,
    enqueueAssistantMessages,
    fetchWithAuth,
    onOpportunityRunChanged,
    onTalentInsightsRefreshed,
    onTalentPreferencesRefreshed,
    sessionPending,
    setActionMessageId,
    setPending,
    setRecommendationStatus,
    setThinkingLogs,
    stage,
    t,
    userId,
  ]);
};
