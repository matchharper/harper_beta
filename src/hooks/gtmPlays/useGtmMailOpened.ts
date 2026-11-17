import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHOWN_MS = 1_000;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const token = data.session?.access_token;
  // Signed-in Harper staff are not counted; the server reads who it is from this.
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function report(mailId: string) {
  void authHeaders().then((headers) =>
    fetch("/api/gtm/opened", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ mailId }),
      keepalive: true,
    }).catch(() => undefined)
  );
}

function mailIdFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get("gtm");
  } catch {
    return null;
  }
}

/**
 * A Harper page opened from a GTM mail's button tells the mail it was opened ("클릭" on the Ops screen): once per
 * page view, after the page has been on screen for a second. It runs in the browser only, so mail scanners that
 * fetch the link are not counted. `mailId` undefined: the ?gtm= value in the address when the page opened.
 */
export function useGtmMailOpened(mailId?: string | null) {
  useEffect(() => {
    const id = mailId === undefined ? mailIdFromUrl() : mailId;
    if (!id || !UUID.test(id)) return;
    let timer: number | null = null;
    let done = false;
    const stop = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const watch = () => {
      if (done) return;
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        if (done || document.visibilityState !== "visible") return;
        done = true;
        document.removeEventListener("visibilitychange", watch);
        report(id);
      }, SHOWN_MS);
    };
    watch();
    document.addEventListener("visibilitychange", watch);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", watch);
    };
  }, [mailId]);
}
