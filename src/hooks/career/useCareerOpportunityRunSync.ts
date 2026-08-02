import { useEffect, useRef } from "react";
import type {
  CareerOpportunityRun,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";

export const useCareerOpportunityRunSync = ({
  conversationId,
  fetchWithAuth,
  hydrateSession,
  loadSessionForCompletedOpportunityRun,
  opportunityRun,
  sessionPending,
  setOpportunityRun,
  stage,
  userId,
}: {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  hydrateSession: (payload: SessionResponse) => void;
  loadSessionForCompletedOpportunityRun: (
    run: CareerOpportunityRun | null
  ) => Promise<SessionResponse | null>;
  opportunityRun: CareerOpportunityRun | null;
  sessionPending: boolean;
  setOpportunityRun: (run: CareerOpportunityRun | null) => void;
  stage: CareerStage;
  userId: string | null;
}) => {
  const emptyCompletedHistoryProbeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !opportunityRun?.inputLocked) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunity-runs/latest"
        );
        const payload = (await response.json().catch(() => ({}))) as {
          run?: CareerOpportunityRun | null;
        };
        if (!response.ok || cancelled) return;

        const nextRun = payload.run ?? null;
        setOpportunityRun(nextRun);
        const sessionPayload =
          await loadSessionForCompletedOpportunityRun(nextRun);
        if (!cancelled && sessionPayload) {
          hydrateSession(sessionPayload);
        }
      } catch {
        // Keep the current lock state; the next poll can recover.
      }
    };

    const intervalId = window.setInterval(() => {
      void poll();
    }, 4000);
    void poll();

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    opportunityRun?.inputLocked,
    setOpportunityRun,
    userId,
  ]);

  useEffect(() => {
    if (
      !userId ||
      sessionPending ||
      stage !== "completed" ||
      opportunityRun?.inputLocked
    ) {
      return;
    }

    const probeKey = [
      userId,
      conversationId ?? "",
      opportunityRun?.id ?? "none",
      opportunityRun?.status ?? "none",
    ].join(":");
    if (emptyCompletedHistoryProbeRef.current === probeKey) return;
    emptyCompletedHistoryProbeRef.current = probeKey;

    let cancelled = false;
    const probeLatestRun = async () => {
      try {
        const response = await fetchWithAuth(
          "/api/talent/opportunity-runs/latest"
        );
        const payload = (await response.json().catch(() => ({}))) as {
          run?: CareerOpportunityRun | null;
        };
        if (!response.ok || cancelled) return;

        const nextRun = payload.run ?? null;
        setOpportunityRun(nextRun);

        const sessionPayload =
          await loadSessionForCompletedOpportunityRun(nextRun);
        if (!cancelled && sessionPayload) {
          hydrateSession(sessionPayload);
        }
      } catch {
        // The regular session load path can recover on the next navigation.
      }
    };

    void probeLatestRun();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    opportunityRun?.id,
    opportunityRun?.inputLocked,
    opportunityRun?.status,
    sessionPending,
    setOpportunityRun,
    stage,
    userId,
  ]);
};
