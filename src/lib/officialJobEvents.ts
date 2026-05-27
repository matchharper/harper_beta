import { supabase } from "@/lib/supabase";

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

export function getOfficialJobsAnonymousId(options = { create: true }) {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(
      OFFICIAL_JOBS_ANONYMOUS_ID_KEY
    );
    if (existing) return existing;
    if (!options.create) return null;

    const next = createAnonymousId();
    window.localStorage.setItem(OFFICIAL_JOBS_ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return null;
  }
}

function getCurrentPath() {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
}

function getReferrer() {
  if (typeof document === "undefined") return null;
  return document.referrer || null;
}

export async function postOfficialJobEvent({
  accessToken,
  eventType,
  jobSlug,
  metadata,
}: PostOfficialJobEventInput) {
  if (typeof window === "undefined") return false;

  try {
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
        anonymousId: getOfficialJobsAnonymousId(),
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
