import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import type {
  AdminCareerJobDetail,
  AdminCareerJobFunnelStep,
  AdminCareerJobFunnelStepKey,
  AdminCareerJobRow,
  AdminCareerJobsResponse,
} from "@/lib/adminCareerAnalytics/types";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  extractEmailFromLandingLoginType,
  getLandingLogSource,
} from "@/lib/landingLogTypes";
import {
  normalizeOfficialJobSlug,
  OFFICIAL_JOBS_LANDING_SOURCE,
  parseOfficialJobLandingLogType,
} from "@/lib/officialJobs/landingLogs";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
} from "@/lib/officialJobs";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

export const runtime = "nodejs";

const BATCH_SIZE = 1000;

type OfficialJobRow = Pick<
  Database["public"]["Tables"]["official_jobs"]["Row"],
  | "company_name"
  | "display_order"
  | "is_published"
  | "published_at"
  | "role_title"
  | "slug"
>;
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "created_at" | "local_id" | "type"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type MutableJobStats = {
  firstViewedAtByLocalId: Map<string, string>;
  lastTalkClickedAt: string | null;
  lastTalkClickedAtByLocalId: Map<string, string>;
  lastViewedAt: string | null;
  lastViewedAtByLocalId: Map<string, string>;
  listClickLocalIds: Set<string>;
  talkClickLocalIds: Set<string>;
  viewLocalIds: Set<string>;
};

const JOB_FUNNEL_META: Array<{
  key: AdminCareerJobFunnelStepKey;
  label: string;
  detail: string;
}> = [
  {
    key: "job_view",
    label: "Job viewed",
    detail: "landing_logs official_jobs:job_view:<slug>",
  },
  {
    key: "talk_click",
    label: "Talk to Harper",
    detail: "landing_logs official_jobs:talk_click:<slug>",
  },
  {
    key: "login",
    label: "Landing login",
    detail: "same local_id login_email:*:official_jobs",
  },
];

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getAdminPassword(req: NextRequest) {
  return (
    req.headers.get("x-admin-password") ??
    req.headers.get("X-Admin-Password") ??
    ""
  );
}

async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data, error } = await queryFactory(from, to);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
  }

  return rows;
}

function isLaterIso(value: string | null | undefined, than: string | null) {
  if (!value) return false;
  if (!than) return true;
  return new Date(value).getTime() > new Date(than).getTime();
}

function isEarlierIso(value: string | null | undefined, than: string | null) {
  if (!value) return false;
  if (!than) return true;
  return new Date(value).getTime() < new Date(than).getTime();
}

function setMinIso(map: Map<string, string>, key: string, value: string) {
  const current = map.get(key) ?? null;
  if (isEarlierIso(value, current)) map.set(key, value);
}

function setMaxIso(map: Map<string, string>, key: string, value: string) {
  const current = map.get(key) ?? null;
  if (isLaterIso(value, current)) map.set(key, value);
}

function getOrCreateJobStats(map: Map<string, MutableJobStats>, slug: string) {
  const existing = map.get(slug);
  if (existing) return existing;

  const next: MutableJobStats = {
    firstViewedAtByLocalId: new Map(),
    lastTalkClickedAt: null,
    lastTalkClickedAtByLocalId: new Map(),
    lastViewedAt: null,
    lastViewedAtByLocalId: new Map(),
    listClickLocalIds: new Set(),
    talkClickLocalIds: new Set(),
    viewLocalIds: new Set(),
  };
  map.set(slug, next);
  return next;
}

function parseLandingLoginEmail(type: string | null | undefined) {
  return normalizeEmail(extractEmailFromLandingLoginType(type));
}

function readExcludedEmails(req: NextRequest) {
  return normalizeExcludedEmails(
    req.nextUrl.searchParams.getAll("excludedEmail")
  );
}

function countIntersection(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) count += 1;
  }
  return count;
}

function buildJobFunnelSteps(counts: {
  login: number;
  talkClick: number;
  view: number;
}) {
  let previousCount: number | null = null;
  return JOB_FUNNEL_META.map((step): AdminCareerJobFunnelStep => {
    const count =
      step.key === "job_view"
        ? counts.view
        : step.key === "talk_click"
          ? counts.talkClick
          : counts.login;
    const result: AdminCareerJobFunnelStep = {
      ...step,
      count,
      rateFromPrevious:
        previousCount !== null && previousCount > 0
          ? count / previousCount
          : null,
      rateFromView: counts.view > 0 ? count / counts.view : null,
    };
    previousCount = count;
    return result;
  });
}

function getViewerStep(args: { hasLogin: boolean; hasTalkClick: boolean }): {
  key: AdminCareerJobFunnelStepKey;
  label: string;
} {
  if (args.hasLogin) return { key: "login", label: "Logged in" };
  if (args.hasTalkClick) return { key: "talk_click", label: "Talk clicked" };
  return { key: "job_view", label: "Viewed" };
}

function buildJobRow(args: {
  job: OfficialJobRow;
  loginLocalIds: Set<string>;
  stats: MutableJobStats | undefined;
}): AdminCareerJobRow {
  const stats = args.stats;
  const viewCount = stats?.viewLocalIds.size ?? 0;
  const talkClickCount = stats?.talkClickLocalIds.size ?? 0;
  const loginCount = stats
    ? countIntersection(stats.viewLocalIds, args.loginLocalIds)
    : 0;

  return {
    jobSlug: args.job.slug,
    roleTitle: args.job.role_title,
    companyName: args.job.company_name,
    isPublished: args.job.is_published,
    publishedAt: args.job.published_at,
    viewCount,
    talkClickCount,
    talkClickRate: viewCount > 0 ? talkClickCount / viewCount : null,
    loginCount,
    lastViewedAt: stats?.lastViewedAt ?? null,
    lastTalkClickedAt: stats?.lastTalkClickedAt ?? null,
  };
}

function buildSelectedJobDetail(args: {
  emailByLocalId: Map<string, string>;
  job: AdminCareerJobRow;
  loginAtByLocalId: Map<string, string>;
  loginLocalIds: Set<string>;
  stats: MutableJobStats | undefined;
}) {
  const stats = args.stats;
  const localIds = new Set<string>([
    ...Array.from(stats?.viewLocalIds ?? []),
    ...Array.from(stats?.talkClickLocalIds ?? []),
  ]);
  const people = Array.from(localIds).map((localId) => {
    const hasTalkClick = Boolean(stats?.talkClickLocalIds.has(localId));
    const hasLogin = args.loginLocalIds.has(localId);
    const currentStep = getViewerStep({ hasLogin, hasTalkClick });

    return {
      localId,
      email: args.emailByLocalId.get(localId) ?? null,
      firstViewedAt: stats?.firstViewedAtByLocalId.get(localId) ?? null,
      lastViewedAt: stats?.lastViewedAtByLocalId.get(localId) ?? null,
      talkClickedAt: stats?.lastTalkClickedAtByLocalId.get(localId) ?? null,
      loginAt: args.loginAtByLocalId.get(localId) ?? null,
      currentStepKey: currentStep.key,
      currentStepLabel: currentStep.label,
    };
  });

  people.sort((a, b) => {
    const aTime = new Date(
      a.loginAt ?? a.talkClickedAt ?? a.lastViewedAt ?? a.firstViewedAt ?? 0
    ).getTime();
    const bTime = new Date(
      b.loginAt ?? b.talkClickedAt ?? b.lastViewedAt ?? b.firstViewedAt ?? 0
    ).getTime();
    return bTime - aTime;
  });

  return {
    ...args.job,
    steps: buildJobFunnelSteps({
      login: args.job.loginCount,
      talkClick: args.job.talkClickCount,
      view: args.job.viewCount,
    }),
    people,
  } satisfies AdminCareerJobDetail;
}

async function buildJobsResponse(req: NextRequest) {
  const excludedEmails = readExcludedEmails(req);
  const excludedEmailSet = new Set(excludedEmails);
  const selectedSlug = normalizeOfficialJobSlug(
    req.nextUrl.searchParams.get("jobSlug")
  );

  const [jobs, landingLogs] = await Promise.all([
    fetchAllRows<OfficialJobRow>((from, to) =>
      supabaseServer
        .from("official_jobs")
        .select(
          "company_name,display_order,is_published,published_at,role_title,slug"
        )
        .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
        .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
        .order("display_order", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("created_at,local_id,type")
        .or("type.like.official_jobs:%,type.like.login_email:%")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const excludedLocalIds = new Set<string>();
  for (const log of landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId) continue;
    const email = parseLandingLoginEmail(log.type);
    if (email && isEmailExcluded(email, excludedEmailSet)) {
      excludedLocalIds.add(localId);
    }
  }

  const statsBySlug = new Map<string, MutableJobStats>();
  const emailByLocalId = new Map<string, string>();
  const loginAtByLocalId = new Map<string, string>();
  const loginLocalIds = new Set<string>();

  for (const log of landingLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;

    const email = parseLandingLoginEmail(log.type);
    if (
      email &&
      getLandingLogSource(log.type) === OFFICIAL_JOBS_LANDING_SOURCE &&
      !isEmailExcluded(email, excludedEmailSet)
    ) {
      loginLocalIds.add(localId);
      emailByLocalId.set(localId, email);
      setMaxIso(loginAtByLocalId, localId, log.created_at);
      continue;
    }

    const parsed = parseOfficialJobLandingLogType(log.type);
    if (!parsed?.jobSlug) continue;

    const stats = getOrCreateJobStats(statsBySlug, parsed.jobSlug);
    if (parsed.event === "job_view") {
      stats.viewLocalIds.add(localId);
      setMinIso(stats.firstViewedAtByLocalId, localId, log.created_at);
      setMaxIso(stats.lastViewedAtByLocalId, localId, log.created_at);
      if (isLaterIso(log.created_at, stats.lastViewedAt)) {
        stats.lastViewedAt = log.created_at;
      }
    } else if (parsed.event === "talk_click") {
      stats.talkClickLocalIds.add(localId);
      setMaxIso(stats.lastTalkClickedAtByLocalId, localId, log.created_at);
      if (isLaterIso(log.created_at, stats.lastTalkClickedAt)) {
        stats.lastTalkClickedAt = log.created_at;
      }
    } else if (parsed.event === "job_list_click") {
      stats.listClickLocalIds.add(localId);
    }
  }

  const jobsBySlug = new Map(jobs.map((job) => [job.slug, job] as const));
  for (const slug of statsBySlug.keys()) {
    if (!jobsBySlug.has(slug)) {
      jobs.push({
        company_name: "-",
        display_order: Number.MAX_SAFE_INTEGER,
        is_published: false,
        published_at: null,
        role_title: slug,
        slug,
      });
    }
  }

  const rows = jobs
    .map((job) =>
      buildJobRow({
        job,
        loginLocalIds,
        stats: statsBySlug.get(job.slug),
      })
    )
    .sort((a, b) => {
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount;
      if (b.talkClickCount !== a.talkClickCount) {
        return b.talkClickCount - a.talkClickCount;
      }
      return a.roleTitle.localeCompare(b.roleTitle);
    });

  const selectedJobRow =
    (selectedSlug ? rows.find((job) => job.jobSlug === selectedSlug) : null) ??
    rows[0] ??
    null;
  const selectedJob = selectedJobRow
    ? buildSelectedJobDetail({
        emailByLocalId,
        job: selectedJobRow,
        loginAtByLocalId,
        loginLocalIds,
        stats: statsBySlug.get(selectedJobRow.jobSlug),
      })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    jobs: rows,
    selectedJob,
  } satisfies AdminCareerJobsResponse;
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    return NextResponse.json(await buildJobsResponse(req));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load career job analytics",
      },
      { status: 500 }
    );
  }
}
