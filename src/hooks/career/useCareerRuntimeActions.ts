import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { CareerOpportunityRun } from "@/components/career/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { showOpportunityDiscoveryStartedToast } from "@/hooks/career/opportunityDiscoveryToast";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

export function useCareerRuntimeActions(args: {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  opportunityRun: CareerOpportunityRun | null;
  opportunityRunTriggerPending: boolean;
  setChatError: Dispatch<SetStateAction<string>>;
  setOpportunityRun: Dispatch<SetStateAction<CareerOpportunityRun | null>>;
  setOpportunityRunTriggerPending: Dispatch<SetStateAction<boolean>>;
}) {
  const {
    conversationId,
    fetchWithAuth,
    opportunityRun,
    opportunityRunTriggerPending,
    setChatError,
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  } = args;

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
          targetRecommendationCount: 150,
          trigger: "immediate_opportunity_requested",
          triggerPayload: {
            manualTest: true,
            source: "career_home_panel_test_button",
          },
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        opportunityDiscoveryQueued?: boolean;
        run?: CareerOpportunityRun | null;
      };

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, "추천 테스트 실행에 실패했습니다.")
        );
      }

      setOpportunityRun(payload.run ?? null);
      if (payload.opportunityDiscoveryQueued) {
        showOpportunityDiscoveryStartedToast();
      }
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
    setOpportunityRun,
    setOpportunityRunTriggerPending,
  ]);

  const resetRuntimeActionsState = useCallback(() => {
    setOpportunityRun(null);
    setOpportunityRunTriggerPending(false);
  }, [setOpportunityRun, setOpportunityRunTriggerPending]);

  return {
    handleRunOpportunityDiscoveryTest,
    resetRuntimeActionsState,
  };
}
