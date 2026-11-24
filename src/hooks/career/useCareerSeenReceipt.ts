import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { FetchWithAuth } from "./useCareerApi";

const isDisplayed = (element: HTMLElement) =>
  typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : element.getClientRects().length > 0;

/** Reports the newest saved message while the chat is actually on screen.
 * The server emails an unseen reply only when this receipt stays behind it. */
export function useCareerSeenReceipt({
  conversationId,
  messages,
  targetRef,
  fetchWithAuth,
}: {
  conversationId: string | null | undefined;
  messages: ReadonlyArray<{ id: string | number }>;
  targetRef: RefObject<HTMLElement | null>;
  fetchWithAuth: FetchWithAuth;
}) {
  // Optimistic and live rows carry non-numeric ids; only saved rows count.
  const latestId = useMemo(
    () =>
      messages.reduce((max, message) => {
        const id = Number(message.id);
        return Number.isSafeInteger(id) && id > max ? id : max;
      }, 0),
    [messages]
  );
  const reported = useRef(new Map<string, number>());

  useEffect(() => {
    if (!conversationId || !latestId) return;
    const report = () => {
      const element = targetRef.current;
      if (document.visibilityState !== "visible" || !element || !isDisplayed(element)) return;
      const previous = reported.current.get(conversationId) ?? 0;
      if (previous >= latestId) return;
      reported.current.set(conversationId, latestId);
      void fetchWithAuth("/api/talent/chat/seen", {
        method: "POST",
        body: JSON.stringify({ conversationId, messageId: latestId }),
        keepalive: true,
      })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
        })
        .catch(() => {
          // A later display or visibility change retries.
          if (reported.current.get(conversationId) === latestId) reported.current.set(conversationId, previous);
        });
    };
    report();
    document.addEventListener("visibilitychange", report);
    window.addEventListener("focus", report);
    // A mobile chat hidden behind another tab becomes visible without a page event.
    const observer =
      typeof IntersectionObserver !== "undefined" && targetRef.current
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) report();
          })
        : null;
    if (observer && targetRef.current) observer.observe(targetRef.current);
    return () => {
      document.removeEventListener("visibilitychange", report);
      window.removeEventListener("focus", report);
      observer?.disconnect();
    };
  }, [conversationId, latestId, targetRef, fetchWithAuth]);
}
