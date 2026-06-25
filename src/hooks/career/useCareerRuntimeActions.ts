import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  CareerOpportunityAgentVariant,
  CareerOpportunityRun,
} from "@/components/career/types";
import { DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT } from "@/lib/opportunityDiscovery/types";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { showOpportunityDiscoveryStartedToast } from "@/hooks/career/opportunityDiscoveryToast";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

type OpportunityRunExternalSelectorMode =
  | "legacy_shortlist"
  | "deepseek_fit_rerank";

export type RunOpportunityDiscoveryTestOptions = {
  claimForManualProcessing?: boolean;
  externalSelectorMode?: OpportunityRunExternalSelectorMode;
  forceNew?: boolean;
};

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
      agentVariant: CareerOpportunityAgentVariant = DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT,
      options: RunOpportunityDiscoveryTestOptions = {}
    ) => {
      const shouldReuseActiveRun = !options.forceNew;
      if (
        (shouldReuseActiveRun && opportunityRun?.inputLocked) ||
        opportunityRunTriggerPending
      ) {
        return null;
      }

      const isPeriodic = mode === "periodic";
      const isDeepseekFitRerank =
        options.externalSelectorMode === "deepseek_fit_rerank";
      setOpportunityRunTriggerPending(true);
      setChatError("");
      try {
        const response = await fetchWithAuth("/api/talent/opportunity-runs", {
          method: "POST",
          body: JSON.stringify({
            conversationId: conversationId ?? null,
            agentVariant,
            claimForManualProcessing: options.claimForManualProcessing ?? false,
            forceNew: options.forceNew ?? false,
            trigger: isPeriodic
              ? "periodic_refresh_due"
              : "immediate_opportunity_requested",
            triggerPayload: isPeriodic
              ? {
                  createdBy: "career_home_panel_dev_button",
                  ...(options.externalSelectorMode
                    ? { externalSelectorMode: options.externalSelectorMode }
                    : {}),
                  opportunityAgentVariant: agentVariant,
                  manualTest: true,
                  simulatedElapsedDays: 3,
                  source: isDeepseekFitRerank
                    ? "career_home_panel_deepseek_fit_rerank_periodic_test_button"
                    : "career_home_panel_periodic_test_button",
                }
              : {
                  ...(options.externalSelectorMode
                    ? { externalSelectorMode: options.externalSelectorMode }
                    : {}),
                  opportunityAgentVariant: agentVariant,
                  manualTest: true,
                  source: isDeepseekFitRerank
                    ? "career_home_panel_deepseek_fit_rerank_test_button"
                    : "career_home_panel_test_button",
                },
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          opportunityDiscoveryQueued?: boolean;
          runId?: string | null;
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
            isDeepseekFitRerank
              ? "DeepSeek fit rerank periodic run을 만들었습니다."
              : isPeriodic
                ? "3일 경과 테스트 run을 큐에 넣었습니다."
                : "기회 검색 테스트 run을 큐에 넣었습니다."
          );
        }
        return payload.run ?? null;
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
      return null;
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
    async (
      agentVariant?: CareerOpportunityAgentVariant,
      options?: RunOpportunityDiscoveryTestOptions
    ) => queueOpportunityRun("immediate", agentVariant, options),
    [queueOpportunityRun]
  );

  const handleRunPeriodicOpportunityDiscoveryTest = useCallback(
    async (
      agentVariant?: CareerOpportunityAgentVariant,
      options?: RunOpportunityDiscoveryTestOptions
    ) => queueOpportunityRun("periodic", agentVariant, options),
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
