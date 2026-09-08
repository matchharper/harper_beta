import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export const GMAIL_INTEGRATION_CHANGED_EVENT =
  "harper:gmail-integration-changed";
export const GMAIL_CONNECTION_SUCCESS_QUERY_PARAM = "gmailConnected";

export type ClientGmailIntegrationStatus =
  | "loading"
  | "error"
  | "active"
  | "expired"
  | "disabled"
  | "not_connected";

export type GmailCareerHistoryAnalysisStatus =
  | "completed"
  | "failed"
  | "not_started"
  | "queued"
  | "retrying"
  | "running"
  | "unavailable";

export function isGmailCareerHistoryAnalysisRunning(
  status: GmailCareerHistoryAnalysisStatus
) {
  return status === "queued" || status === "running" || status === "retrying";
}

type GmailIntegrationStatusPayload = {
  analysis: {
    status: GmailCareerHistoryAnalysisStatus;
    updatedAt: string | null;
  };
  connected: boolean;
  status: Exclude<ClientGmailIntegrationStatus, "loading" | "error">;
};

type GmailAnalysisStatusPayload = Pick<
  GmailIntegrationStatusPayload,
  "analysis"
>;

type GmailConnectPayload = Omit<GmailIntegrationStatusPayload, "analysis"> & {
  analysis?: GmailIntegrationStatusPayload["analysis"];
  alreadyConnected?: boolean;
  redirectUrl?: string;
};

const GMAIL_INTEGRATION_STALE_TIME_MS = 5 * 60_000;
const GMAIL_INTEGRATION_GC_TIME_MS = 30 * 60_000;
const GMAIL_ANALYSIS_POLL_INTERVAL_MS = 3_000;

export const gmailIntegrationQueryKey = (userId: string | null) =>
  ["career-gmail-integration", userId] as const;

export function notifyGmailIntegrationChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GMAIL_INTEGRATION_CHANGED_EVENT));
}

export function useGmailIntegration(userId: string | null) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    "analyze" | "connect" | "disconnect" | null
  >(null);
  const queryKey = useMemo(() => gmailIntegrationQueryKey(userId), [userId]);

  const loadFullStatus = useCallback(
    () =>
      fetchWithInternalAuth<GmailIntegrationStatusPayload>(
        "/api/talent/integrations/gmail"
      ),
    []
  );

  const loadStatus = useCallback(async () => {
    const current =
      queryClient.getQueryData<GmailIntegrationStatusPayload>(queryKey);
    if (
      !current ||
      !isGmailCareerHistoryAnalysisRunning(current.analysis.status)
    ) {
      return loadFullStatus();
    }
    const payload = await fetchWithInternalAuth<GmailAnalysisStatusPayload>(
      "/api/talent/integrations/gmail?analysisOnly=true"
    );
    return { ...current, analysis: payload.analysis };
  }, [loadFullStatus, queryClient, queryKey]);

  const statusQuery = useQuery({
    enabled: Boolean(userId),
    gcTime: GMAIL_INTEGRATION_GC_TIME_MS,
    queryFn: loadStatus,
    queryKey,
    refetchInterval: (query) =>
      isGmailCareerHistoryAnalysisRunning(
        query.state.data?.analysis.status ?? "not_started"
      )
        ? GMAIL_ANALYSIS_POLL_INTERVAL_MS
        : false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: GMAIL_INTEGRATION_STALE_TIME_MS,
  });

  const refresh = useCallback(
    () =>
      queryClient.fetchQuery({
        gcTime: GMAIL_INTEGRATION_GC_TIME_MS,
        queryFn: loadFullStatus,
        queryKey,
        staleTime: 0,
      }),
    [loadFullStatus, queryClient, queryKey]
  );

  useEffect(() => {
    const handleChanged = () => {
      void refresh().catch(() => undefined);
    };
    window.addEventListener(GMAIL_INTEGRATION_CHANGED_EVENT, handleChanged);
    return () => {
      window.removeEventListener(
        GMAIL_INTEGRATION_CHANGED_EVENT,
        handleChanged
      );
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setPendingAction("connect");
    try {
      const payload = await fetchWithInternalAuth<GmailConnectPayload>(
        "/api/talent/integrations/gmail/connect",
        { method: "POST" }
      );
      if (payload.connected) {
        const current =
          queryClient.getQueryData<GmailIntegrationStatusPayload>(queryKey);
        queryClient.setQueryData<GmailIntegrationStatusPayload>(queryKey, {
          analysis: payload.analysis ??
            current?.analysis ?? { status: "not_started", updatedAt: null },
          connected: true,
          status: payload.status,
        });
        notifyGmailIntegrationChanged();
        return payload;
      }
      if (!payload.redirectUrl) {
        throw new Error("Gmail connect URL was not returned");
      }
      window.location.assign(payload.redirectUrl);
      return payload;
    } finally {
      setPendingAction(null);
    }
  }, [queryClient, queryKey]);

  const disconnect = useCallback(async () => {
    setPendingAction("disconnect");
    const previous =
      queryClient.getQueryData<GmailIntegrationStatusPayload>(queryKey);
    if (previous) {
      queryClient.setQueryData<GmailIntegrationStatusPayload>(queryKey, {
        ...previous,
        connected: false,
        status: "disabled",
      });
    }
    try {
      const payload =
        await fetchWithInternalAuth<GmailIntegrationStatusPayload>(
          "/api/talent/integrations/gmail",
          { method: "DELETE" }
        );
      queryClient.setQueryData(queryKey, payload);
      notifyGmailIntegrationChanged();
    } catch (error) {
      if (previous) queryClient.setQueryData(queryKey, previous);
      throw error;
    } finally {
      setPendingAction(null);
    }
  }, [queryClient, queryKey]);

  const analyze = useCallback(async () => {
    setPendingAction("analyze");
    try {
      const payload = await fetchWithInternalAuth<{
        analysis: {
          status: "queued";
        };
        ok: true;
        status: "queued";
      }>("/api/talent/integrations/gmail/analyze", { method: "POST" });
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<GmailIntegrationStatusPayload>(
        queryKey,
        (current) =>
          current
            ? {
                ...current,
                analysis: {
                  ...current.analysis,
                  status: payload.analysis.status,
                },
              }
            : {
                analysis: {
                  status: payload.analysis.status,
                  updatedAt: null,
                },
                connected: true,
                status: "active",
              }
      );
    } finally {
      setPendingAction(null);
    }
  }, [queryClient, queryKey]);

  const status: ClientGmailIntegrationStatus = statusQuery.data
    ? statusQuery.data.status
    : statusQuery.isError
      ? "error"
      : userId
        ? "loading"
        : "not_connected";
  const analysisStatus =
    statusQuery.data?.analysis.status ?? ("not_started" as const);
  const analysisUpdatedAt = statusQuery.data?.analysis.updatedAt ?? null;

  return {
    analysisStatus,
    analysisUpdatedAt,
    analyze,
    connect,
    disconnect,
    pendingAction,
    refresh,
    status,
  };
}
