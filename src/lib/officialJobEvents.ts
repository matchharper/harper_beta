import { supabase } from "@/lib/supabase";
import {
  OFFICIAL_JOBS_LANDING_ABTEST_TYPE,
  OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY,
  OFFICIAL_JOBS_LANDING_SESSION_GAP_MS,
  OFFICIAL_JOBS_LANDING_SOURCE,
} from "@/lib/officialJobLandingLogs";
import { withLandingLogSource } from "@/lib/landingLogTypes";

export const OFFICIAL_JOBS_ANONYMOUS_ID_KEY =
  "harper_official_jobs_anonymous_id_v1";

export type OfficialJobEventType =
  | "jobs_list_view"
  | "jobs_cta_click"
  | "jobs_identity_linked"
  | "job_detail_view"
  | "job_list_click"
  | "job_apply_click"
  | "job_company_click";

type OfficialJobEventMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

type PostOfficialJobEventInput = {
  accessToken?: string | null;
  eventType: OfficialJobEventType;
  jobSlug?: string | null;
  metadata?: OfficialJobEventMetadata;
};

function createAnonymousId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getOfficialJobsAnonymousIdentity(options = { create: true }) {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(
      OFFICIAL_JOBS_ANONYMOUS_ID_KEY
    );
    if (existing) return { anonymousId: existing, isNew: false };
    if (!options.create) return null;

    const next = createAnonymousId();
    window.localStorage.setItem(OFFICIAL_JOBS_ANONYMOUS_ID_KEY, next);
    return { anonymousId: next, isNew: true };
  } catch {
    return null;
  }
}

export function getOfficialJobsAnonymousId(options = { create: true }) {
  return getOfficialJobsAnonymousIdentity(options)?.anonymousId ?? null;
}

function getCurrentPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function getReferrer() {
  if (typeof document === "undefined") return null;
  return document.referrer || null;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return null;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

async function insertOfficialJobsLandingEntry(
  anonymousId: string,
  type: "new_session" | "new_visit"
) {
  const { error } = await supabase.from("landing_logs").insert({
    local_id: anonymousId,
    type: withLandingLogSource(type, OFFICIAL_JOBS_LANDING_SOURCE),
    abtest_type: OFFICIAL_JOBS_LANDING_ABTEST_TYPE,
    is_mobile: isMobileBrowser(),
    country_lang:
      typeof navigator !== "undefined" ? navigator.language || null : null,
  });

  if (error) {
    console.warn("official jobs landing entry log failed:", error.message);
  }
}

async function ensureOfficialJobsLandingEntry(args: {
  anonymousId: string;
  isNew: boolean;
}) {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const lastVisitRaw = window.localStorage.getItem(
    OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY
  );
  const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;
  window.localStorage.setItem(
    OFFICIAL_JOBS_LANDING_LAST_VISIT_AT_KEY,
    now.toString()
  );

  if (args.isNew || !lastVisitAt || !Number.isFinite(lastVisitAt)) {
    await insertOfficialJobsLandingEntry(args.anonymousId, "new_visit");
    return;
  }

  if (now - lastVisitAt >= OFFICIAL_JOBS_LANDING_SESSION_GAP_MS) {
    await insertOfficialJobsLandingEntry(args.anonymousId, "new_session");
  }
}

export async function postOfficialJobEvent({
  accessToken,
  eventType,
  jobSlug,
  metadata,
}: PostOfficialJobEventInput) {
  if (typeof window === "undefined") return false;

  try {
    const identity = getOfficialJobsAnonymousIdentity();
    if (identity && eventType !== "jobs_identity_linked") {
      void ensureOfficialJobsLandingEntry(identity);
    }

    let resolvedAccessToken = accessToken ?? null;
    if (!resolvedAccessToken) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      resolvedAccessToken = session?.access_token ?? null;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (resolvedAccessToken) {
      headers.Authorization = `Bearer ${resolvedAccessToken}`;
    }

    const response = await fetch("/api/official-jobs/events", {
      method: "POST",
      headers,
      body: JSON.stringify({
        anonymousId: identity?.anonymousId ?? null,
        eventType,
        jobSlug: jobSlug ?? null,
        metadata: metadata ?? {},
        path: getCurrentPath(),
        referrer: getReferrer(),
      }),
      keepalive: true,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      console.warn("postOfficialJobEvent failed:", response.status, message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("postOfficialJobEvent failed:", error);
    return false;
  }
}

export async function linkOfficialJobEventsToCurrentUser(
  accessToken?: string | null
) {
  if (typeof window === "undefined") return false;

  const anonymousId = getOfficialJobsAnonymousId({ create: false });
  if (!anonymousId) return false;

  return postOfficialJobEvent({
    accessToken,
    eventType: "jobs_identity_linked",
    metadata: { source: "auth_signed_in" },
  });
}
