import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  CareerOpportunityAgentVariant,
  CareerOpportunityRun,
} from "@/components/career/types";
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

  const queueOpportunityRun = useCallback(
    async (
      mode: "immediate" | "periodic",
      agentVariant: CareerOpportunityAgentVariant = "tool_agent"
    ) => {
      if (opportunityRun?.inputLocked || opportunityRunTriggerPending) {
        return;
      }

      const isPeriodic = mode === "periodic";
      setOpportunityRunTriggerPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth("/api/talent/opportunity-runs", {
          method: "POST",
          body: JSON.stringify({
            conversationId: conversationId ?? null,
            agentVariant,
            trigger: isPeriodic
              ? "periodic_refresh_due"
              : "immediate_opportunity_requested",
            triggerPayload: isPeriodic
              ? {
                  createdBy: "career_home_panel_dev_button",
                  opportunityAgentVariant: agentVariant,
                  manualTest: true,
                  simulatedElapsedDays: 3,
                  source: "career_home_panel_periodic_test_button",
                }
              : {
                  opportunityAgentVariant: agentVariant,
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
            getErrorMessage(
              payload,
              isPeriodic
                ? "3일 경과 테스트 실행에 실패했습니다."
                : "추천 테스트 실행에 실패했습니다."
            )
          );
        }

        setOpportunityRun(payload.run ?? null);
        if (payload.opportunityDiscoveryQueued) {
          showOpportunityDiscoveryStartedToast(
            isPeriodic
              ? "3일 경과 테스트 run을 큐에 넣었습니다."
              : "기회 검색 테스트 run을 큐에 넣었습니다."
          );
        }
      } catch (error) {
        setChatError(
          error instanceof Error
            ? error.message
            : isPeriodic
              ? "3일 경과 테스트 실행 중 오류가 발생했습니다."
              : "추천 테스트 실행 중 오류가 발생했습니다."
        );
      } finally {
        setOpportunityRunTriggerPending(false);
      }
    },
    [
      conversationId,
      fetchWithAuth,
      opportunityRun?.inputLocked,
      opportunityRunTriggerPending,
      setChatError,
      setOpportunityRun,
      setOpportunityRunTriggerPending,
    ]
  );

  const handleRunOpportunityDiscoveryTest = useCallback(
    async (agentVariant?: CareerOpportunityAgentVariant) =>
      queueOpportunityRun("immediate", agentVariant),
    [queueOpportunityRun]
  );

  const handleRunPeriodicOpportunityDiscoveryTest = useCallback(
    async (agentVariant?: CareerOpportunityAgentVariant) =>
      queueOpportunityRun("periodic", agentVariant),
    [queueOpportunityRun]
  );

  const resetRuntimeActionsState = useCallback(() => {
    setOpportunityRun(null);
    setOpportunityRunTriggerPending(false);
  }, [setOpportunityRun, setOpportunityRunTriggerPending]);

  return {
    handleRunPeriodicOpportunityDiscoveryTest,
    handleRunOpportunityDiscoveryTest,
    resetRuntimeActionsState,
  };
}
