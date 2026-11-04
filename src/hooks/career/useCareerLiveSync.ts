import { useEffect, useRef } from "react";
import {
  buildCareerLiveSyncTopic,
  CAREER_LIVE_SYNC_DEBOUNCE_MS,
  CAREER_LIVE_SYNC_EVENT,
  readCareerLiveSyncScope,
  type CareerLiveSyncScope,
} from "@/lib/career/liveSync";
import { createAuthenticatedRealtimeClient } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

export type { CareerLiveSyncScope } from "@/lib/career/liveSync";

export const useCareerLiveSync = ({
  enabled,
  onSync,
  userId,
}: {
  enabled: boolean;
  onSync: (scopes: CareerLiveSyncScope[]) => Promise<void> | void;
  userId: string | null;
}) => {
  const onSyncRef = useRef(onSync);
  const session = useAuthStore((state) => state.session);
  const accessToken = session?.user.id === userId ? session.access_token : null;

  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    const normalizedUserId = userId?.trim() ?? "";
    if (!enabled || !normalizedUserId || !accessToken) return;

    let disposed = false;
    let syncRunning = false;
    let timeoutId: number | null = null;
    const pendingScopes = new Set<CareerLiveSyncScope>();

    const flush = async () => {
      if (disposed || syncRunning || pendingScopes.size === 0) return;
      syncRunning = true;
      try {
        while (!disposed && pendingScopes.size > 0) {
          const scopes = pendingScopes.has("all")
            ? (["all"] satisfies CareerLiveSyncScope[])
            : Array.from(pendingScopes);
          pendingScopes.clear();
          try {
            await onSyncRef.current(scopes);
          } catch {
            // Focus/reconnect and the next broadcast provide a natural retry.
          }
        }
      } finally {
        syncRunning = false;
      }
    };

    const schedule = (
      scope: CareerLiveSyncScope,
      delay = CAREER_LIVE_SYNC_DEBOUNCE_MS
    ) => {
      if (disposed) return;
      if (scope === "all") {
        pendingScopes.clear();
      }
      pendingScopes.add(scope);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        void flush();
      }, delay);
    };

    const syncWhenVisible = () => {
      if (document.hidden) return;
      schedule("all", 0);
    };

    const realtime = createAuthenticatedRealtimeClient();
    const isCurrentSession = () => {
      const currentSession = useAuthStore.getState().session;
      return (
        !disposed &&
        currentSession?.access_token === accessToken &&
        currentSession.user.id === normalizedUserId
      );
    };
    void (async () => {
      await realtime.setAuth(accessToken);
      if (!isCurrentSession()) return;
      const channel = realtime
        .channel(buildCareerLiveSyncTopic(normalizedUserId), {
          config: { private: true },
        })
        .on("broadcast", { event: CAREER_LIVE_SYNC_EVENT }, (payload) => {
          schedule(readCareerLiveSyncScope(payload));
        });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Reconcile once after every successful join so events missed while
          // disconnected cannot leave the Career workspace stale.
          schedule("all", 0);
        }
      });
    })().catch(() => undefined);

    window.addEventListener("focus", syncWhenVisible);
    window.addEventListener("online", syncWhenVisible);
    document.addEventListener("visibilitychange", syncWhenVisible);
    // Broadcasts are not replayed. A missed notification must not leave a
    // completed background reply invisible until the user reloads the page.
    const reconcileInterval = window.setInterval(() => {
      if (!document.hidden) schedule("messages", 0);
    }, 30_000);

    return () => {
      disposed = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.clearInterval(reconcileInterval);
      pendingScopes.clear();
      window.removeEventListener("focus", syncWhenVisible);
      window.removeEventListener("online", syncWhenVisible);
      document.removeEventListener("visibilitychange", syncWhenVisible);
      void realtime.removeAllChannels();
    };
  }, [enabled, userId, accessToken]);
};
