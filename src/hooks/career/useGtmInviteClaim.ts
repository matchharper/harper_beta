import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { parseSignupNext, signupNextQuery } from "@/lib/gtmPlays/agent/signupMove";

const PARAM = "gtm";
const STORAGE_KEY = "harper:gtm-invite";
const POSTING_KEY = "harper:gtm-invite-posting";
/** An Ashley link's next step (?next=&posting=&question=), kept with the mail id through sign-up (#5). */
const NEXT_KEY = "harper:gtm-invite-next";

/** The posting a GTM mail was about, as its Harper page showed it (for sign-up and onboarding). */
export type GtmInvitePostingSummary = {
  mailId: string; title: string; companyName: string | null;
  /** How many postings the mail proposed (an agent mail has 2-3; the first one is title/companyName). */
  count?: number;
};

export function readGtmInvitePosting(): GtmInvitePostingSummary | null {
  try {
    const raw = window.localStorage.getItem(POSTING_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<GtmInvitePostingSummary>) : null;
    const pendingId = window.localStorage.getItem(STORAGE_KEY);
    if (!value?.mailId || !value.title || value.mailId !== pendingId) return null;
    const count = typeof value.count === "number" && value.count > 1 ? Math.floor(value.count) : 1;
    return { mailId: value.mailId, title: value.title, companyName: value.companyName ?? null, count };
  } catch {
    return null;
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function remember(mailId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mailId);
    const query = signupNextQuery(parseSignupNext(Object.fromEntries(new URL(window.location.href).searchParams)));
    if (query) window.localStorage.setItem(NEXT_KEY, JSON.stringify({ mailId, query }));
  } catch {
    // Storage blocked: the link still works while the ?gtm= value stays in the address.
  }
}

/**
 * The pending mail and its next step, for the sign-up requests (bootstrap, onboarding submit, the claim): the address
 * first, else what was kept for that same mail. Empty when there is no pending mail.
 */
export function readPendingGtmInviteSignup(): { gtmMailId?: string; next?: string; posting?: string; question?: string } {
  try {
    const mailId = pending();
    if (!mailId) return {};
    const fromUrl = signupNextQuery(parseSignupNext(Object.fromEntries(new URL(window.location.href).searchParams)));
    const kept = JSON.parse(window.localStorage.getItem(NEXT_KEY) ?? "null") as { mailId?: string; query?: string } | null;
    const query = fromUrl || (kept?.mailId === mailId ? kept.query ?? "" : "");
    const next = parseSignupNext(Object.fromEntries(new URLSearchParams(query)));
    return {
      gtmMailId: mailId,
      ...(next.step ? { next: next.step } : {}),
      ...(next.posting ? { posting: next.posting } : {}),
      ...(next.question ? { question: next.question } : {}),
    };
  } catch {
    return {};
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

/** The GTM mail this browser came from, while it waits for sign-up (?gtm= in the address, else kept). */
export const readPendingGtmInvite = () => pending();

function forget() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(POSTING_KEY);
    window.localStorage.removeItem(NEXT_KEY);
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
      for (const key of [PARAM, "gtm_open", "next", "posting", "question"]) url.searchParams.delete(key);
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
  const count = invite?.count ?? 1;
  useEffect(() => {
    try {
      const fromUrl = mailId ?? new URL(window.location.href).searchParams.get(PARAM);
      if (!fromUrl || !UUID.test(fromUrl)) return;
      remember(fromUrl);
      if (title) window.localStorage.setItem(POSTING_KEY, JSON.stringify({ mailId: fromUrl, title, companyName, count }));
    } catch {
      // Nothing to keep.
    }
  }, [mailId, title, companyName, count]);
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
      body: JSON.stringify({ ...readPendingGtmInviteSignup(), mailId, locale }),
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
