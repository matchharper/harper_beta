import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export const GMAIL_INTEGRATION_CHANGED_EVENT =
  "harper:gmail-integration-changed";
export const GMAIL_CONNECTION_SUCCESS_QUERY_PARAM = "gmailConnected";

export type ClientGmailIntegrationStatus =
  | "loading"
  | "error"
  | "permissions_required"
  | "active"
  | "expired"
  | "disabled"
  | "not_connected";

type GmailIntegrationStatusPayload = {
  connected: boolean;
  writeConnected?: boolean;
  /** Sent while not connected: the account's mailbox is on Google, so Gmail can read it. */
  googleMail?: boolean;
  /** Connected locally, but the provider could not be reached to confirm it. */
  temporarilyUnavailable?: boolean;
  status: Exclude<ClientGmailIntegrationStatus, "loading" | "error">;
};

type GmailConnectPayload = GmailIntegrationStatusPayload & {
  redirectUrl?: string;
};

const GMAIL_INTEGRATION_STALE_TIME_MS = 5 * 60_000;
const GMAIL_INTEGRATION_GC_TIME_MS = 30 * 60_000;
export const gmailIntegrationQueryKey = (userId: string | null) =>
  ["career-gmail-integration", userId] as const;

export function notifyGmailIntegrationChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GMAIL_INTEGRATION_CHANGED_EVENT));
}

export function useGmailIntegration(
  userId: string | null,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<
    "connect" | "disconnect" | null
  >(null);
  const queryKey = useMemo(() => gmailIntegrationQueryKey(userId), [userId]);

  const loadStatus = useCallback(
    () =>
      fetchWithInternalAuth<GmailIntegrationStatusPayload>(
        "/api/talent/integrations/gmail"
      ),
    []
  );

  const statusQuery = useQuery({
    enabled: enabled && Boolean(userId),
    gcTime: GMAIL_INTEGRATION_GC_TIME_MS,
    queryFn: loadStatus,
    queryKey,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    staleTime: GMAIL_INTEGRATION_STALE_TIME_MS,
  });

  const refresh = useCallback(
    () =>
      queryClient.fetchQuery({
        gcTime: GMAIL_INTEGRATION_GC_TIME_MS,
        queryFn: loadStatus,
        queryKey,
        staleTime: 0,
      }),
    [loadStatus, queryClient, queryKey]
  );

  useEffect(() => {
    if (!enabled || !userId) return;
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
  }, [enabled, refresh, userId]);

  const connect = useCallback(
    async (options?: {
      capability?: "write" | "read";
      conversationId?: string | null;
      /** Where the person pressed connect, for the connection logs. */
      source?: "chat_card" | "settings";
    }) => {
      setPendingAction("connect");
      try {
        const payload = await fetchWithInternalAuth<GmailConnectPayload>(
          "/api/talent/integrations/gmail/connect",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...(options?.capability ? { capability: options.capability } : {}),
              ...(options?.conversationId ? { conversationId: options.conversationId } : {}),
              ...(options?.source ? { source: options.source } : {}),
              returnTo: window.location.pathname + window.location.search,
            }),
          }
        );
        if (payload.connected) {
          const current =
            queryClient.getQueryData<GmailIntegrationStatusPayload>(queryKey);
          queryClient.setQueryData<GmailIntegrationStatusPayload>(queryKey, {
            connected: true,
            writeConnected: options?.capability === "write" || current?.writeConnected === true,
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
    },
    [queryClient, queryKey]
  );

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

  const status: ClientGmailIntegrationStatus = statusQuery.data
    ? statusQuery.data.status
    : statusQuery.isError
      ? "error"
      : userId
        ? "loading"
        : "not_connected";
  return {
    connect,
    disconnect,
    pendingAction,
    refresh,
    status,
    writeConnected: status === "active" && statusQuery.data?.writeConnected === true,
    // A past or partial connection already proves a Google mailbox. During a
    // provider outage the real grant is unknown, so nothing is offered.
    canConnectMailbox: status === "not_connected"
      ? statusQuery.data?.googleMail === true
      : status !== "loading" && status !== "error" && statusQuery.data?.temporarilyUnavailable !== true,
  };
}
