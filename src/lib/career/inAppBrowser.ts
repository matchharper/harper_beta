import { normalizeCareerUtmSource } from "@/lib/career/utm";
import { OFFICIAL_JOBS_LANDING_SOURCE } from "@/lib/officialJobs/landingLogs";

export type InAppBrowserApp =
  | "linkedin"
  | "kakaotalk"
  | "instagram"
  | "threads"
  | "facebook"
  | "line"
  | "naver"
  | "daum"
  | "twitter";

const IN_APP_BROWSER_APPS: ReadonlyArray<readonly [InAppBrowserApp, RegExp]> =
  [
    ["linkedin", /linkedinapp/i],
    ["kakaotalk", /kakaotalk|kakaostory/i],
    ["instagram", /instagram/i],
    ["threads", /threads|barcelona/i],
    ["facebook", /fbav|fban|fb_iab/i],
    ["line", /line\//i],
    ["naver", /naver\(inapp|naver\(apps/i],
    ["daum", /daumapps/i],
    ["twitter", /twitter/i],
  ];

/** Names the app whose in-app browser this is. Null when no known app matches. */
export function detectInAppBrowserApp(
  userAgent: string
): InAppBrowserApp | null {
  for (const [app, pattern] of IN_APP_BROWSER_APPS) {
    if (pattern.test(userAgent)) return app;
  }
  return null;
}

export type MobileOs = "ios" | "android" | "other";

export function detectMobileOs(userAgent: string): MobileOs {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  return "other";
}

/**
 * Browser facts for login-step logs: only the browser kind, nothing about the
 * user. `inApp` comes from the login page's own in-app check.
 */
export function describeBrowserForLog(userAgent: string, inApp: boolean) {
  return {
    inApp,
    app: inApp ? (detectInAppBrowserApp(userAgent) ?? "other") : null,
    os: detectMobileOs(userAgent),
  };
}

/**
 * iOS: `x-safari-https://…` asks iOS to open the URL in Safari. iOS 16 does
 * not support it, Apple does not document it, and some apps block it without
 * any error, so callers must keep a fallback for when nothing happens.
 */
export function buildSafariOpenUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return `x-safari-${parsed.protocol.replace(":", "")}://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

const LANDING_ID_PATTERN = /^[A-Za-z0-9-]{8,120}$/;

/**
 * The /jobs visitor ID that a login URL carries (`lid` with
 * `source=official_jobs`, on the URL or inside its `next`). A user who moves
 * from an in-app browser to Safari or Chrome keeps only this URL, not the ID
 * saved in the in-app browser.
 */
export function readOfficialJobsLandingIdFromSearch(
  search: string,
  origin = "https://matchharper.com"
) {
  const params = new URLSearchParams(search);
  let source = params.get("source");
  let landingId = params.get("lid");
  const next = params.get("next");
  if (next && (!source || !landingId)) {
    try {
      const nextUrl = new URL(next, origin);
      source = source || nextUrl.searchParams.get("source");
      landingId = landingId || nextUrl.searchParams.get("lid");
    } catch {
      // A malformed `next` leaves only what the URL itself carries.
    }
  }

  if (normalizeCareerUtmSource(source) !== OFFICIAL_JOBS_LANDING_SOURCE) {
    return null;
  }
  const normalized = String(landingId ?? "").trim();
  return LANDING_ID_PATTERN.test(normalized) ? normalized : null;
}

/**
 * The ID this browser uses for /jobs events. The saved one always wins; the
 * URL's is used only when this browser has none, so it never replaces an
 * identity.
 */
export function resolveOfficialJobsAnonymousId(args: {
  storedId: string | null;
  search: string;
  origin?: string;
}): { anonymousId: string; adopted: boolean } | null {
  const storedId = String(args.storedId ?? "").trim();
  if (storedId) return { anonymousId: storedId, adopted: false };

  const fromUrl = readOfficialJobsLandingIdFromSearch(args.search, args.origin);
  return fromUrl ? { anonymousId: fromUrl, adopted: true } : null;
}

type PageVisibilityTarget = {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
};

type PageLifecycleTarget = {
  addEventListener(type: "pagehide", listener: () => void): void;
  removeEventListener(type: "pagehide", listener: () => void): void;
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number): void;
};

/**
 * After asking the phone to open an outside browser, tells what happened:
 * - `onLeft`: the app went to the background (the browser came up),
 * - `onReplaced`: this page was unloaded, e.g. the in-app browser showed an
 *   error page for the link,
 * - `onStayed`: the page is still showing after `fallbackAfterMs`.
 * `onLeft` can still follow `onStayed` (the user found the app's menu, or
 * answered a prompt). Returns a cleanup.
 */
export function watchForPageLeave(args: {
  doc: PageVisibilityTarget;
  win: PageLifecycleTarget;
  fallbackAfterMs: number;
  watchMs: number;
  onLeft: () => void;
  onReplaced: () => void;
  onStayed: () => void;
}) {
  let done = false;

  const cleanup = () => {
    if (done) return;
    done = true;
    args.win.clearTimeout(fallbackTimer);
    args.win.clearTimeout(stopTimer);
    args.doc.removeEventListener("visibilitychange", handleVisibilityChange);
    args.win.removeEventListener("pagehide", handlePageHide);
  };
  const handleVisibilityChange = () => {
    if (done || args.doc.visibilityState !== "hidden") return;
    cleanup();
    args.onLeft();
  };
  const handlePageHide = () => {
    if (done) return;
    cleanup();
    args.onReplaced();
  };

  const fallbackTimer = args.win.setTimeout(() => {
    if (!done) args.onStayed();
  }, args.fallbackAfterMs);
  const stopTimer = args.win.setTimeout(cleanup, args.watchMs);
  args.doc.addEventListener("visibilitychange", handleVisibilityChange);
  args.win.addEventListener("pagehide", handlePageHide);

  return cleanup;
}
