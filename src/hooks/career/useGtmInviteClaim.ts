import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

const PARAM = "gtm";
const STORAGE_KEY = "harper:gtm-invite";
const POSTING_KEY = "harper:gtm-invite-posting";

/** The posting a GTM mail was about, as its Harper page showed it (for sign-up and onboarding). */
export type GtmInvitePostingSummary = { mailId: string; title: string; companyName: string | null };

export function readGtmInvitePosting(): GtmInvitePostingSummary | null {
  try {
    const raw = window.localStorage.getItem(POSTING_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<GtmInvitePostingSummary>) : null;
    const pendingId = window.localStorage.getItem(STORAGE_KEY);
    if (!value?.mailId || !value.title || value.mailId !== pendingId) return null;
    return { mailId: value.mailId, title: value.title, companyName: value.companyName ?? null };
  } catch {
    return null;
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function remember(mailId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mailId);
  } catch {
    // Storage blocked: the link still works while the ?gtm= value stays in the address.
  }
}

function pending(): string | null {
  try {
    const fromUrl = new URL(window.location.href).searchParams.get(PARAM);
    if (fromUrl && UUID.test(fromUrl)) return fromUrl;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && UUID.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

function forget() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(POSTING_KEY);
  } catch {
    // Nothing to clear.
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** The posting of the GTM mail this browser came from, while it waits for sign-up (null on the server). */
export function useGtmInvitePosting(): GtmInvitePostingSummary | null {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => {
      const value = readGtmInvitePosting();
      return value ? JSON.stringify(value) : "";
    },
    () => "",
  );
  return useMemo(() => (raw ? (JSON.parse(raw) as GtmInvitePostingSummary) : null), [raw]);
}

const claimedThisVisit = new Set<string>();

function dropParam(mailId: string) {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(PARAM) === mailId) {
      url.searchParams.delete(PARAM);
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    // The address keeps ?gtm=; claimedThisVisit stops a second call.
  }
}

/**
 * A Harper page opened from a GTM mail (/jobs/<slug>?gtm=<mail id>, or the mail's own posting page): keeps
 * the id, so the mail is counted (and its posting put in the inbox) once the person signs up and reaches
 * /career, and the posting's name for the sign-up and onboarding screens.
 */
export function useRememberGtmInvite(invite?: GtmInvitePostingSummary | null) {
  const mailId = invite?.mailId ?? null;
  const title = invite?.title ?? null;
  const companyName = invite?.companyName ?? null;
  useEffect(() => {
    try {
      const fromUrl = mailId ?? new URL(window.location.href).searchParams.get(PARAM);
      if (!fromUrl || !UUID.test(fromUrl)) return;
      remember(fromUrl);
      if (title) window.localStorage.setItem(POSTING_KEY, JSON.stringify({ mailId: fromUrl, title, companyName }));
    } catch {
      // Nothing to keep.
    }
  }, [mailId, title, companyName]);
}

/**
 * A person who opened /career from a Harper GTM mail (?gtm=<mail id>): the id is kept through sign-up,
 * sign-in and onboarding, and once they are signed in and onboarded (`ready`) the mail's posting is put in
 * their inbox (POST /api/talent/gtm-invite), once, and `onImported` opens it.
 */
export function useGtmInviteClaim(args: {
  user: User | null; ready: boolean; locale: "ko" | "en"; onImported: (roleId: string) => void;
}) {
  const { user, ready, locale } = args;
  const onImported = useRef(args.onImported);
  useEffect(() => {
    onImported.current = args.onImported;
  });
  useEffect(() => {
    const mailId = pending();
    if (!mailId) return;
    remember(mailId);
    if (!user || !ready || claimedThisVisit.has(mailId)) return;
    claimedThisVisit.add(mailId);
    void fetchWithInternalAuth<{ status: string; roleId?: string }>("/api/talent/gtm-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mailId, locale }),
    })
      .then((result) => {
        forget();
        dropParam(mailId);
        // The posting is in the inbox: open it there, as a link to one opportunity does.
        if (result?.status === "imported" && result.roleId) onImported.current(result.roleId);
      })
      .catch((error: unknown) => {
        // Kept for the next visit (a failed import is tried again then); the person can still reply to the mail.
        claimedThisVisit.delete(mailId);
        console.warn("[gtm-invite] could not add the posting", error);
      });
  }, [user, ready, locale]);
}
