import "server-only";

import { extractEmailFromLandingLoginType } from "@/lib/landingLogTypes";
import type { TalentAdminClient } from "./admin";

export type InternalRoleRequestEntryPage = "/about" | "/jobs";

export type InternalRoleRequestEntryVisit = {
  createdAt: string | null | undefined;
  page: InternalRoleRequestEntryPage;
};

const ABOUT_LOG_TYPE = "career_view_about";
const ABOUT_PAGE_VISIT_TYPE = "page_visit:/about";
const JOBS_VIEW_EVENT_TYPES = ["jobs_list_view", "job_detail_view"] as const;
const LANDING_ENTRY_PAGE_FILTER = [
  `type.eq.${ABOUT_PAGE_VISIT_TYPE}`,
  "type.eq.page_visit:/jobs",
  "type.like.page_visit:/jobs/%",
  "type.eq.official_jobs:list_view",
  "type.like.official_jobs:job_view:%",
].join(",");

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function classifyLandingEntryPage(
  type: string | null | undefined
): InternalRoleRequestEntryPage | null {
  const normalized = String(type ?? "").trim();
  if (normalized === ABOUT_PAGE_VISIT_TYPE) return "/about";
  if (
    normalized === "page_visit:/jobs" ||
    normalized.startsWith("page_visit:/jobs/") ||
    normalized === "official_jobs:list_view" ||
    normalized.startsWith("official_jobs:job_view:")
  ) {
    return "/jobs";
  }
  return null;
}

function toVisitTimestamp(value: string | null | undefined) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function pickLatestInternalRoleRequestEntryPage(
  visits: InternalRoleRequestEntryVisit[]
): InternalRoleRequestEntryPage | null {
  let latest: {
    page: InternalRoleRequestEntryPage;
    timestamp: number;
  } | null = null;

  for (const visit of visits) {
    const timestamp = toVisitTimestamp(visit.createdAt);
    if (timestamp === null) continue;
    if (
      !latest ||
      timestamp > latest.timestamp ||
      (timestamp === latest.timestamp && visit.page === "/jobs")
    ) {
      latest = { page: visit.page, timestamp };
    }
  }

  return latest?.page ?? null;
}

function firstCreatedAt(data: unknown) {
  if (!Array.isArray(data)) return null;
  const first = data[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const createdAt = (first as Record<string, unknown>).created_at;
  return typeof createdAt === "string" ? createdAt : null;
}

function warnEntryPageLookupFailure(source: string, error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "Unknown error")
      : String(error ?? "Unknown error");
  console.warn("[internal-role-priority-review] entry page lookup failed", {
    error: message,
    source,
  });
}

async function fetchLinkedLandingEntryVisits(args: {
  admin: TalentAdminClient;
  before: string;
  email?: string | null;
}) {
  const email = normalizeEmail(args.email);
  if (!email) return [];

  const loginTypePrefix = `login_email:${email}`;
  const { data: loginRows, error: loginError } = await args.admin
    .from("landing_logs")
    .select("local_id, type")
    .ilike("type", `${escapeLikePattern(loginTypePrefix)}%`)
    .lte("created_at", args.before)
    .order("created_at", { ascending: false })
    .limit(100);

  if (loginError) {
    warnEntryPageLookupFailure("landing_identity", loginError);
    return [];
  }

  const localIds = Array.from(
    new Set(
      (loginRows ?? [])
        .filter(
          (row) =>
            normalizeEmail(extractEmailFromLandingLoginType(row.type)) === email
        )
        .map((row) => String(row.local_id ?? "").trim())
        .filter(Boolean)
    )
  );
  if (localIds.length === 0) return [];

  const { data: landingRows, error: landingError } = await args.admin
    .from("landing_logs")
    .select("created_at, type")
    .in("local_id", localIds)
    .or(LANDING_ENTRY_PAGE_FILTER)
    .lte("created_at", args.before)
    .order("created_at", { ascending: false })
    .limit(500);

  if (landingError) {
    warnEntryPageLookupFailure("landing_visit", landingError);
    return [];
  }

  return (landingRows ?? []).flatMap((row) => {
    const page = classifyLandingEntryPage(row.type);
    return page ? [{ createdAt: row.created_at, page }] : [];
  });
}

export async function fetchLatestInternalRoleRequestEntryPage(args: {
  admin: TalentAdminClient;
  before: string;
  email?: string | null;
  userId: string;
}): Promise<InternalRoleRequestEntryPage | null> {
  const [aboutResult, jobsResult, linkedLandingVisits] = await Promise.all([
    args.admin
      .from("logs")
      .select("created_at")
      .eq("user_id", args.userId)
      .eq("type", ABOUT_LOG_TYPE)
      .lte("created_at", args.before)
      .order("created_at", { ascending: false })
      .limit(1),
    args.admin
      .from("official_job_events")
      .select("created_at")
      .eq("user_id", args.userId)
      .in("event_type", [...JOBS_VIEW_EVENT_TYPES])
      .lte("created_at", args.before)
      .order("created_at", { ascending: false })
      .limit(1),
    fetchLinkedLandingEntryVisits(args),
  ]);

  const visits: InternalRoleRequestEntryVisit[] = [...linkedLandingVisits];
  if (aboutResult.error) {
    warnEntryPageLookupFailure("authenticated_about_visit", aboutResult.error);
  } else {
    visits.push({
      createdAt: firstCreatedAt(aboutResult.data),
      page: "/about",
    });
  }

  if (jobsResult.error) {
    warnEntryPageLookupFailure("official_jobs_visit", jobsResult.error);
  } else {
    visits.push({
      createdAt: firstCreatedAt(jobsResult.data),
      page: "/jobs",
    });
  }

  return pickLatestInternalRoleRequestEntryPage(visits);
}
