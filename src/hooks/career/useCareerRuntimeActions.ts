import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  CareerMockInterviewSession,
  CareerMockInterviewType,
  CareerOpportunityRun,
} from "@/components/career/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

export function useCareerRuntimeActions(args: {
  cacheAssistantMessages: (rawMessages: unknown[]) => void;
  companySnapshotPending: boolean;
  conversationId: string | null;
  enqueueAssistantMessages: (rawMessages: unknown[]) => Promise<void>;
  fetchWithAuth: FetchWithAuth;
  handleStartCallMode: (openingText?: string) => Promise<boolean>;
  mockInterviewPending: boolean;
  mockInterviewSession: CareerMockInterviewSession | null;
  opportunityRun: CareerOpportunityRun | null;
  opportunityRunTriggerPending: boolean;
  primeCallAudioPlayback: () => void;
  setCompanySnapshotPending: Dispatch<SetStateAction<boolean>>;
  setChatError: Dispatch<SetStateAction<string>>;
  setMockInterviewPending: Dispatch<SetStateAction<boolean>>;
  setMockInterviewSession: Dispatch<
    SetStateAction<CareerMockInterviewSession | null>
  >;
  setOpportunityRun: Dispatch<SetStateAction<CareerOpportunityRun | null>>;
  setOpportunityRunTriggerPending: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    cacheAssistantMessages,
    companySnapshotPending,
    conversationId,
    enqueueAssistantMessages,
    fetchWithAuth,
    handleStartCallMode,
    mockInterviewPending,
    mockInterviewSession,
    opportunityRun,
    opportunityRunTriggerPending,
    primeCallAudioPlayback,
    setCompanySnapshotPending,
    setChatError,
    setMockInterviewPending,
    setMockInterviewSession,
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  } = args;

  const handlePrepareMockInterview = useCallback(
    async (opportunityId?: string | null) => {
      if (!conversationId || mockInterviewPending) return;

      setMockInterviewSession(null);
      setMockInterviewPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/mock-interview/prepare",
          {
            method: "POST",
            body: JSON.stringify({
              conversationId,
              opportunityId: opportunityId?.trim() || undefined,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "모의 인터뷰 준비에 실패했습니다.")
          );
        }

        setMockInterviewSession(
          (payload.mockInterviewSession ??
            payload.session ??
            null) as CareerMockInterviewSession | null
        );
        await enqueueAssistantMessages(
          Array.isArray(payload.messages) ? payload.messages : []
        );
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "모의 인터뷰 준비 중 오류가 발생했습니다."
        );
      } finally {
        setMockInterviewPending(false);
      }
    },
    [
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      mockInterviewPending,
      setChatError,
    ]
  );

  const handleStartMockInterview = useCallback(
    async (args: {
      channel: "call" | "chat";
      interviewType: CareerMockInterviewType;
      sessionId: string;
    }) => {
      if (!conversationId || mockInterviewPending) return;

      if (args.channel === "call") {
        primeCallAudioPlayback();
      }

      setMockInterviewPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/mock-interview/start",
          {
            method: "POST",
            body: JSON.stringify({
              channel: args.channel,
              conversationId,
              interviewType: args.interviewType,
              sessionId: args.sessionId,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "모의 인터뷰 시작에 실패했습니다.")
          );
        }

        setMockInterviewSession(
          (payload.mockInterviewSession ??
            payload.session ??
            null) as CareerMockInterviewSession | null
        );
        const message = payload.message ?? payload.assistantMessage;
        if (args.channel === "call") {
          const openingText =
            message &&
            typeof message === "object" &&
            "content" in message &&
            typeof message.content === "string"
              ? message.content
              : undefined;
          const callStarted = await handleStartCallMode(openingText);
          if (message && callStarted) {
            cacheAssistantMessages([message]);
          } else if (message) {
            await enqueueAssistantMessages([message]);
          }
          return;
        }
        if (message) {
          await enqueueAssistantMessages([message]);
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "모의 인터뷰 시작 중 오류가 발생했습니다."
        );
      } finally {
        setMockInterviewPending(false);
      }
    },
    [
      cacheAssistantMessages,
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      handleStartCallMode,
      mockInterviewPending,
      primeCallAudioPlayback,
      setChatError,
    ]
  );

  const handleEndMockInterview = useCallback(
    async (sessionId?: string | null) => {
      if (!conversationId || mockInterviewPending) return;

      setMockInterviewPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth("/api/talent/mock-interview/end", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            sessionId: sessionId ?? mockInterviewSession?.id ?? null,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "모의 인터뷰 종료에 실패했습니다.")
          );
        }

        setMockInterviewSession(
          (payload.mockInterviewSession ??
            payload.session ??
            null) as CareerMockInterviewSession | null
        );
        const message = payload.message ?? payload.assistantMessage;
        if (message) {
          await enqueueAssistantMessages([message]);
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "모의 인터뷰 종료 중 오류가 발생했습니다."
        );
      } finally {
        setMockInterviewPending(false);
      }
    },
    [
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      mockInterviewPending,
      mockInterviewSession?.id,
      setChatError,
    ]
  );

  const handleStartCompanySnapshot = useCallback(
    async (args: { companyName: string; reason?: string | null }) => {
      const companyName = args.companyName.trim();
      if (!conversationId || !companyName || companySnapshotPending) return;

      setCompanySnapshotPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth(
          "/api/talent/company-snapshot/start",
          {
            method: "POST",
            body: JSON.stringify({
              companyName,
              conversationId,
              reason: args.reason ?? null,
            }),
          }
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "회사 조사 시작에 실패했습니다.")
          );
        }

        const message = payload.message ?? payload.assistantMessage;
        if (message) {
          await enqueueAssistantMessages([message]);
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : "회사 조사 시작 중 오류가 발생했습니다."
        );
      } finally {
        setCompanySnapshotPending(false);
      }
    },
    [
      companySnapshotPending,
      conversationId,
      enqueueAssistantMessages,
      fetchWithAuth,
      setChatError,
    ]
  );

  const handleRunOpportunityDiscoveryTest = useCallback(async () => {
    if (opportunityRun?.inputLocked || opportunityRunTriggerPending) {
      return;
    }

    setOpportunityRunTriggerPending(true);
    setChatError("");
    try {
      const response = await fetchWithAuth("/api/talent/opportunity-runs", {
        method: "POST",
        body: JSON.stringify({
          chatPreviewCount: 3,
          conversationId: conversationId ?? null,
          targetRecommendationCount: 80,
          trigger: "immediate_opportunity_requested",
          triggerPayload: {
            manualTest: true,
            source: "career_home_panel_test_button",
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        run?: CareerOpportunityRun | null;
      };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "추천 테스트 실행에 실패했습니다.")
        );
      }

      setOpportunityRun(payload.run ?? null);
    } catch (error) {
      setChatError(
        error instanceof Error
          ? error.message
          : "추천 테스트 실행 중 오류가 발생했습니다."
      );
    } finally {
      setOpportunityRunTriggerPending(false);
    }
  }, [
    conversationId,
    fetchWithAuth,
    opportunityRun?.inputLocked,
    opportunityRunTriggerPending,
    setChatError,
  ]);

  const resetRuntimeActionsState = useCallback(() => {
    setOpportunityRun(null);
    setOpportunityRunTriggerPending(false);
    setMockInterviewSession(null);
    setMockInterviewPending(false);
    setCompanySnapshotPending(false);
  }, []);

  return {
    handleEndMockInterview,
    handlePrepareMockInterview,
    handleRunOpportunityDiscoveryTest,
    handleStartCompanySnapshot,
    handleStartMockInterview,
    resetRuntimeActionsState,
  };
}
