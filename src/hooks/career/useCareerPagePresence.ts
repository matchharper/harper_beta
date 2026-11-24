import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/** While open, even hidden behind another tab or app, the page keeps reporting. */
const HEARTBEAT_MS = 60_000;

let pageId: string | null = null;
/** One id per page load; a reload is a new page. */
const currentPageId = () => (pageId ??= crypto.randomUUID());

/**
 * Tells the server this Career page is open, and that it closed when the tab or
 * browser closes it. An unseen reply is emailed only after every open page
 * reported closing, so a tab switch, an app switch, or another Harper screen
 * (which leave the page open) never sends one. A close that is never reported
 * (a phone app killed in the background) leaves the page open: no email.
 */
export function useCareerPagePresence(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let token: string | null = null;
    let stopped = false;

    // Sent synchronously with the token already in hand, so it can leave during pagehide.
    const send = (closed: boolean) => {
      if (!token) return;
      void fetch("/api/talent/presence", {
        method: "POST",
        keepalive: true,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: currentPageId(), closed }),
      }).catch(() => {
        // A missed open report keeps the last one; a missed close keeps the page open. Both mean no email.
      });
    };
    const reportOpen = () =>
      void supabase.auth.getSession().then(({ data }) => {
        if (stopped) return;
        token = data.session?.access_token ?? null;
        send(false);
      });

    reportOpen();
    const { data: auth } = supabase.auth.onAuthStateChange((_event, session) => {
      token = session?.access_token ?? null;
    });
    const timer = window.setInterval(reportOpen, HEARTBEAT_MS);
    // persisted: kept in the back/forward cache, not closed. It may come back.
    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) send(true);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reportOpen();
    };
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      // Leaving Career inside the same tab is not closing it.
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      auth.subscription.unsubscribe();
    };
  }, [enabled]);
}
