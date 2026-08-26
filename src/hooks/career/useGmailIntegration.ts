import { useCallback, useEffect, useState } from "react";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export const GMAIL_INTEGRATION_CHANGED_EVENT =
  "harper:gmail-integration-changed";

export type ClientGmailIntegrationStatus =
  | "loading"
  | "error"
  | "active"
  | "expired"
  | "disabled"
  | "not_connected";

type GmailIntegrationStatusPayload = {
  connected: boolean;
  status: Exclude<ClientGmailIntegrationStatus, "loading" | "error">;
};

type GmailConnectPayload = GmailIntegrationStatusPayload & {
  alreadyConnected?: boolean;
  redirectUrl?: string;
};

export function notifyGmailIntegrationChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(GMAIL_INTEGRATION_CHANGED_EVENT));
}

export function useGmailIntegration() {
  const [status, setStatus] = useState<ClientGmailIntegrationStatus>("loading");
  const [pendingAction, setPendingAction] = useState<
    "connect" | "disconnect" | null
  >(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    try {
      const payload =
        await fetchWithInternalAuth<GmailIntegrationStatusPayload>(
          "/api/talent/integrations/gmail"
        );
      setStatus(payload.status);
      return payload;
    } catch (error) {
      setStatus("error");
      throw error;
    }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refresh().catch(() => undefined);
    }, 0);
    const handleChanged = () => {
      void refresh().catch(() => undefined);
    };
    window.addEventListener(GMAIL_INTEGRATION_CHANGED_EVENT, handleChanged);
    return () => {
      window.clearTimeout(initialRefresh);
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
        setStatus("active");
        notifyGmailIntegrationChanged();
        return;
      }
      if (!payload.redirectUrl) {
        throw new Error("Gmail connect URL was not returned");
      }
      window.location.assign(payload.redirectUrl);
    } finally {
      setPendingAction(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setPendingAction("disconnect");
    setStatus("disabled");
    try {
      const payload =
        await fetchWithInternalAuth<GmailIntegrationStatusPayload>(
          "/api/talent/integrations/gmail",
          { method: "DELETE" }
        );
      setStatus(payload.status);
      notifyGmailIntegrationChanged();
    } finally {
      setPendingAction(null);
    }
  }, []);

  return {
    connect,
    disconnect,
    pendingAction,
    refresh,
    status,
  };
}
