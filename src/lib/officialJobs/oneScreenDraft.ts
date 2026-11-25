/**
 * Pure helpers for the job page's one screen (OfficialJobOneScreen): the draft
 * kept across the Google redirect, the LinkedIn check, the
 * URLs it opens, and which account slot this browser gets.
 */
import {
  chooseBrowserOpenMethod,
  detectInAppBrowserApp,
} from "@/lib/career/inAppBrowser";
import { linkedinProfileUrl } from "@/lib/gtmPlays/invitePrefill";

export const ONE_SCREEN_DRAFT_KEY_PREFIX = "harper_onescreen_draft:";
/** ?onescreen=1: the full-page one screen. */
export const ONE_SCREEN_PAGE_PARAM = "onescreen";
/** ?os_google=1: arrived from an in-app browser's Google button; start Google once. */
export const ONE_SCREEN_GOOGLE_PARAM = "os_google";
/** ?mode=similar: open on the similar-postings form. */
export const ONE_SCREEN_MODE_PARAM = "mode";

/** A draft older than this is not restored (a consent box from days ago is not a consent). */
export const ONE_SCREEN_DRAFT_MAX_AGE_MS = 24 * 60 * 60_000;

/** What the one screen keeps across the Google redirect. The CV file is never kept. */
export type OneScreenDraft = {
  name: string;
  linkedinUrl: string;
  note: string;
  consent: boolean;
  /** A CV had been picked: the file is gone, so the form asks for it again. */
  hadResume: boolean;
  savedAt: number;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function oneScreenDraftKey(slug: string) {
  return `${ONE_SCREEN_DRAFT_KEY_PREFIX}${slug}`;
}

export function parseOneScreenDraft(
  raw: string | null,
  now: number
): OneScreenDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : NaN;
  if (!Number.isFinite(savedAt) || now - savedAt > ONE_SCREEN_DRAFT_MAX_AGE_MS) {
    return null;
  }
  const text = (key: string) =>
    typeof record[key] === "string" ? (record[key] as string) : "";
  return {
    name: text("name"),
    linkedinUrl: text("linkedinUrl"),
    note: text("note"),
    consent: record.consent === true,
    hadResume: record.hadResume === true,
    savedAt,
  };
}

export function isEmptyOneScreenDraft(
  draft: Omit<OneScreenDraft, "savedAt">
) {
  return (
    !draft.name.trim() &&
    !draft.linkedinUrl.trim() &&
    !draft.note.trim() &&
    !draft.consent &&
    !draft.hadResume
  );
}

export function readOneScreenDraft(
  storage: DraftStorage | null | undefined,
  slug: string,
  now = Date.now()
) {
  try {
    return parseOneScreenDraft(storage?.getItem(oneScreenDraftKey(slug)) ?? null, now);
  } catch {
    return null;
  }
}

/** Saves the draft, or removes it when nothing is filled in. */
export function writeOneScreenDraft(
  storage: DraftStorage | null | undefined,
  slug: string,
  draft: Omit<OneScreenDraft, "savedAt">,
  now = Date.now()
) {
  try {
    if (!storage) return;
    if (isEmptyOneScreenDraft(draft)) {
      storage.removeItem(oneScreenDraftKey(slug));
      return;
    }
    // Unchanged content keeps the time it was really written: restoring a draft
    // must not restart its 24 hours, or an old consent would never expire.
    const existing = parseOneScreenDraft(storage.getItem(oneScreenDraftKey(slug)), now);
    if (
      existing &&
      existing.name === draft.name &&
      existing.linkedinUrl === draft.linkedinUrl &&
      existing.note === draft.note &&
      existing.consent === draft.consent &&
      existing.hadResume === draft.hadResume
    ) {
      return;
    }
    const saved: OneScreenDraft = {
      name: draft.name,
      linkedinUrl: draft.linkedinUrl,
      note: draft.note,
      consent: draft.consent,
      hadResume: draft.hadResume,
      savedAt: now,
    };
    storage.setItem(oneScreenDraftKey(slug), JSON.stringify(saved));
  } catch {
    // Storage blocked or full: the form still works, it just won't survive a redirect.
  }
}

export function clearOneScreenDraft(
  storage: DraftStorage | null | undefined,
  slug: string
) {
  try {
    storage?.removeItem(oneScreenDraftKey(slug));
  } catch {
    // Storage blocked: nothing was kept.
  }
}

/** window.localStorage, or null where reading it throws (blocked storage). */
export function getOneScreenStorage(): DraftStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** A LinkedIn member profile (linkedin.com/in/<id>) as https://www.linkedin.com/in/<id>; null otherwise. */
export function checkOneScreenLinkedinUrl(value: string | null | undefined) {
  return linkedinProfileUrl(value);
}

export function isOneScreenEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** ③ is done with a picked CV, or with a valid LinkedIn URL while the LinkedIn tile is on. */
export function isOneScreenMaterialReady(args: {
  resumeFile: unknown;
  linkedinOn: boolean;
  linkedinUrl: string;
}) {
  const linkedin = args.linkedinOn ? args.linkedinUrl.trim() : "";
  const linkedinValid = linkedin ? checkOneScreenLinkedinUrl(linkedin) !== null : false;
  // An address typed but not valid blocks sending, so the step is not done yet.
  if (linkedin && !linkedinValid) return false;
  return Boolean(args.resumeFile) || linkedinValid;
}

/**
 * Where Google (and the code mail's link) comes back to: this page without
 * os_google, and without mode, since both start from the sign-up box.
 */
export function oneScreenReturnPath(href: string) {
  const url = new URL(href, "https://matchharper.com");
  url.searchParams.delete(ONE_SCREEN_GOOGLE_PARAM);
  url.searchParams.delete(ONE_SCREEN_MODE_PARAM);
  return `${url.pathname}${url.search}`;
}

/**
 * The URL an outside browser opens from an in-app browser: the full-page one
 * screen, which starts Google once (os_google=1).
 */
/** The in-app browser's /jobs visitor id, carried to the outside browser so its steps join this visit. */
export const ONE_SCREEN_FROM_VISITOR_PARAM = "lid";
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{8,120}$/;

export function oneScreenBrowserUrl(href: string, visitorId?: string | null) {
  const url = new URL(href);
  url.searchParams.delete(ONE_SCREEN_MODE_PARAM);
  url.searchParams.set(ONE_SCREEN_PAGE_PARAM, "1");
  url.searchParams.set(ONE_SCREEN_GOOGLE_PARAM, "1");
  if (visitorId && VISITOR_ID_PATTERN.test(visitorId)) {
    url.searchParams.set(ONE_SCREEN_FROM_VISITOR_PARAM, visitorId);
  }
  url.hash = "";
  return url.toString();
}

/** The visitor id a Safari hop or a copied link carried, for the step logs; null otherwise. */
export function readOneScreenFromVisitor(search: string) {
  const value = new URLSearchParams(search).get(ONE_SCREEN_FROM_VISITOR_PARAM)?.trim() ?? "";
  return VISITOR_ID_PATTERN.test(value) ? value : null;
}

export function hasOneScreenGoogleParam(search: string) {
  return new URLSearchParams(search).get(ONE_SCREEN_GOOGLE_PARAM) === "1";
}

/**
 * The account slot for this browser:
 * - google: a normal browser, Google works here;
 * - safari: iPhone LinkedIn, ask iOS for Safari (as the login page does);
 * - android_menu: LinkedIn on Android, only its ⋮ menu leaves the app;
 * - in_app: another in-app browser (KakaoTalk, Instagram...), open a browser or copy the link.
 * The email code works in every one of them.
 */
export type OneScreenAccountSlot = "google" | "safari" | "android_menu" | "in_app";

export function chooseOneScreenAccountSlot(userAgent: string): OneScreenAccountSlot {
  const inApp =
    detectInAppBrowserApp(userAgent) !== null || /;\s*wv\)|\bwv\b/i.test(userAgent);
  if (!inApp) return "google";
  const method = chooseBrowserOpenMethod(userAgent);
  if (method === "x_safari") return "safari";
  if (method === "android_menu_guide") return "android_menu";
  return "in_app";
}
