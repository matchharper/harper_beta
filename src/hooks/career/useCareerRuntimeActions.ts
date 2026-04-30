import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CareerOpportunityRun } from "@/components/career/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

export function useCareerRuntimeActions(args: {
  companySnapshotPending: boolean;
  conversationId: string | null;
  enqueueAssistantMessages: (rawMessages: unknown[]) => Promise<void>;
  fetchWithAuth: FetchWithAuth;
  opportunityRun: CareerOpportunityRun | null;
  opportunityRunTriggerPending: boolean;
  setCompanySnapshotPending: Dispatch<SetStateAction<boolean>>;
  setChatError: Dispatch<SetStateAction<string>>;
  setOpportunityRun: Dispatch<SetStateAction<CareerOpportunityRun | null>>;
  setOpportunityRunTriggerPending: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    companySnapshotPending,
    conversationId,
    enqueueAssistantMessages,
    fetchWithAuth,
    opportunityRun,
    opportunityRunTriggerPending,
    setCompanySnapshotPending,
    setChatError,
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  } = args;

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
    setCompanySnapshotPending(false);
  }, []);

  return {
    handleRunOpportunityDiscoveryTest,
    handleStartCompanySnapshot,
    resetRuntimeActionsState,
  };
}
