import {
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  CareerMessage,
  CareerOpportunityRun,
  CareerStage,
  SessionResponse,
} from "@/components/career/types";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { extractOpportunityRunMarkers } from "@/lib/opportunityDiscovery/messageMarker";

const isRunActive = (run: CareerOpportunityRun) =>
  run.active || run.status === "queued" || run.status === "running";

const shouldPollRun = (run: CareerOpportunityRun) =>
  isRunActive(run) || run.deliveryRetryPending;

export const useCareerOpportunityRunSync = ({
  conversationId,
  fetchWithAuth,
  hydrateSession,
  loadSessionForCompletedOpportunityRun,
  messages,
  opportunityRun,
  sessionPending,
  setOpportunityRun,
  setUnlinkedOpportunityRuns,
  stage,
  unlinkedOpportunityRuns,
  updateOpportunityRunsInCache,
  userId,
}: {
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  hydrateSession: (payload: SessionResponse) => void;
  loadSessionForCompletedOpportunityRun: (
    run: CareerOpportunityRun | null
  ) => Promise<SessionResponse | null>;
  messages: CareerMessage[];
  opportunityRun: CareerOpportunityRun | null;
  sessionPending: boolean;
  setOpportunityRun: (run: CareerOpportunityRun | null) => void;
  setUnlinkedOpportunityRuns: Dispatch<SetStateAction<CareerOpportunityRun[]>>;
  stage: CareerStage;
  unlinkedOpportunityRuns: CareerOpportunityRun[];
  updateOpportunityRunsInCache: (runs: CareerOpportunityRun[]) => void;
  userId: string | null;
}) => {
  const emptyCompletedHistoryProbeRef = useRef<string | null>(null);
  const opportunityRunRef = useRef(opportunityRun);

  useEffect(() => {
    opportunityRunRef.current = opportunityRun;
  }, [opportunityRun]);

  const markerRunState = useMemo(() => {
    const runById = new Map<string, CareerOpportunityRun>();
    const markerRunIds = new Set<string>();

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const marker of extractOpportunityRunMarkers(message.content)) {
        markerRunIds.add(marker.runId);
      }
      if (message.recommendationSearchRun) {
        runById.set(
          message.recommendationSearchRun.id.toLowerCase(),
          message.recommendationSearchRun
        );
      }
    }
    for (const run of unlinkedOpportunityRuns) {
      runById.set(run.id.toLowerCase(), run);
    }

    const pollIds = Array.from(markerRunIds).filter((runId) => {
      const run = runById.get(runId.toLowerCase());
      return !run || shouldPollRun(run);
    });
    for (const run of unlinkedOpportunityRuns) {
      const runId = run.id.toLowerCase();
      if (shouldPollRun(run) && !pollIds.includes(runId)) pollIds.push(runId);
    }

    const activeSearch = pollIds.some((runId) => {
      const run = runById.get(runId.toLowerCase());
      return !run || isRunActive(run);
    });

    return {
      activeSearch,
      pollIds,
      pollKey: pollIds.slice().sort().join(","),
    };
  }, [messages, unlinkedOpportunityRuns]);

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
    if (!userId || !markerRunState.pollKey) return;

    let cancelled = false;
    let polling = false;
    let continuePolling = true;
    let timeoutId: number | null = null;
    const requestedIds = markerRunState.pollKey
      ? markerRunState.pollKey.split(",")
      : [];
    const pollIntervalMs = markerRunState.activeSearch ? 4_000 : 30_000;

    const schedule = () => {
      if (cancelled) return;
      const delay = document.hidden
        ? Math.max(30_000, pollIntervalMs * 4)
        : pollIntervalMs;
      timeoutId = window.setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      if (polling || cancelled) return;
      polling = true;
      let terminalRun: CareerOpportunityRun | null = null;
      try {
        const searchParams = new URLSearchParams({
          ids: requestedIds.join(","),
        });
        const response = await fetchWithAuth(
          `/api/talent/opportunity-runs?${searchParams.toString()}`
        );
        const payload = (await response.json().catch(() => ({}))) as {
          runs?: CareerOpportunityRun[];
        };
        if (!response.ok || cancelled) return;

        const runs = Array.isArray(payload.runs) ? payload.runs : [];
        continuePolling = runs.some(shouldPollRun);
        const hadActiveSearch = markerRunState.activeSearch;
        updateOpportunityRunsInCache(runs);
        setUnlinkedOpportunityRuns((currentRuns) => {
          let changed = false;
          const nextRuns = currentRuns.flatMap((current) => {
            const next = runs.find(
              (run) => run.id.toLowerCase() === current.id.toLowerCase()
            );
            if (!next || next === current) return [current];
            if (!isRunActive(next)) {
              changed = true;
              return [];
            }
            if (
              next.status === current.status &&
              (next.updatedAt ?? next.createdAt) ===
                (current.updatedAt ?? current.createdAt) &&
              next.deliveryRetryPending === current.deliveryRetryPending
            ) {
              return [current];
            }
            changed = true;
            return [next];
          });
          return changed ? nextRuns : currentRuns;
        });

        const currentOpportunityRun = opportunityRunRef.current?.id
          ? runs.find(
              (run) =>
                run.id.toLowerCase() ===
                opportunityRunRef.current?.id.toLowerCase()
            )
          : null;
        if (
          currentOpportunityRun &&
          (currentOpportunityRun.status !== opportunityRunRef.current?.status ||
            (currentOpportunityRun.updatedAt ??
              currentOpportunityRun.createdAt) !==
              (opportunityRunRef.current?.updatedAt ??
                opportunityRunRef.current?.createdAt) ||
            currentOpportunityRun.deliveryRetryPending !==
              opportunityRunRef.current?.deliveryRetryPending)
        ) {
          setOpportunityRun(currentOpportunityRun);
        }

        terminalRun = hadActiveSearch
          ? (runs.find((run) => !isRunActive(run) && run.searchTerminal) ??
            null)
          : null;
      } catch {
        // Keep the message-linked state and retry on the next interval/focus.
      } finally {
        polling = false;
      }

      if (terminalRun) {
        const sessionPayload =
          await loadSessionForCompletedOpportunityRun(terminalRun);
        if (!cancelled && sessionPayload) hydrateSession(sessionPayload);
        if (!continuePolling) return;
      }
      if (continuePolling) schedule();
    };

    const pollWhenVisible = () => {
      if (document.hidden || polling || cancelled) return;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      void poll();
    };

    window.addEventListener("focus", pollWhenVisible);
    document.addEventListener("visibilitychange", pollWhenVisible);
    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", pollWhenVisible);
      document.removeEventListener("visibilitychange", pollWhenVisible);
    };
  }, [
    fetchWithAuth,
    hydrateSession,
    loadSessionForCompletedOpportunityRun,
    markerRunState.activeSearch,
    markerRunState.pollKey,
    setOpportunityRun,
    setUnlinkedOpportunityRuns,
    updateOpportunityRunsInCache,
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
