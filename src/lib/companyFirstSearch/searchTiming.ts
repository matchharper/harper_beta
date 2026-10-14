import type { OrgAgentAdminClient } from "@/lib/org/agent/data";

/**
 * Measured timing facts the company-side LLM uses to say when a search starts
 * and roughly how long it takes. A fact that cannot be read is left out; it
 * never fails the action that already queued the search.
 */
export type CompanySearchTiming = {
  /** Start of the reused search; set only when it is already running. */
  startedAt: string | null;
  startedMinutesAgo: number | null;
  /** Due searches have waited an hour while no search started or finished. */
  startMayBeDelayed: boolean;
  /** Median start-to-finish minutes of recent completed searches, rounded to 5. */
  typicalMinutes: number | null;
};

/** The first search a newly activated Role waits for. */
export type RoleFirstSearchStart = {
  startsAt: string;
  /**
   * "now" when it is running or next to start, "waiting" when it is due but
   * other searches start first, "scheduled" when its slot is still ahead.
   */
  start: "now" | "scheduled" | "waiting";
  startMayBeDelayed: boolean;
};

const SEARCH_TRIGGERS = ["company_requested", "role_activated", "scheduled"];
const RECENT_DAYS = 60;
const STALLED_MINUTES = 60;

const runs = (admin: OrgAgentAdminClient) =>
  admin.from("company_first_search_runs" as any) as any;

const minutesBefore = (now: Date, minutes: number) =>
  new Date(now.getTime() - minutes * 60_000).toISOString();

async function optional<T>(label: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    console.warn(`[company-first/search-timing:${label}]`, error);
    return null;
  }
}

function runMinutes(rows: unknown) {
  return (Array.isArray(rows) ? rows : [])
    .map((row: Record<string, unknown>) =>
      (Date.parse(String(row.finished_at)) - Date.parse(String(row.started_at))) / 60_000)
    .filter(minutes => Number.isFinite(minutes) && minutes >= 0);
}

/**
 * Prefers the same kind of search when at least three finished recently: an
 * explicit request selects more people than a scheduled run.
 */
export function typicalSearchMinutes(sameKindRows: unknown, anyKindRows: unknown) {
  const sameKind = runMinutes(sameKindRows);
  const sample = (sameKind.length >= 3 ? sameKind : runMinutes(anyKindRows))
    .sort((a, b) => a - b);
  if (!sample.length) return null;
  const middle = Math.floor(sample.length / 2);
  const median = sample.length % 2
    ? sample[middle]!
    : (sample[middle - 1]! + sample[middle]!) / 2;
  return Math.max(5, Math.round(median / 5) * 5);
}

async function readTypicalMinutes(admin: OrgAgentAdminClient, now: Date, trigger: string) {
  const recent = () => runs(admin)
    .select("started_at,finished_at")
    .eq("status", "succeeded")
    .not("started_at", "is", null)
    .gte("finished_at", minutesBefore(now, RECENT_DAYS * 24 * 60))
    .order("finished_at", { ascending: false });
  const [sameKind, anyKind] = await Promise.all([
    recent().eq("trigger_reason", trigger).limit(10),
    recent().in("trigger_reason", SEARCH_TRIGGERS).limit(20),
  ]);
  if (sameKind.error) throw sameKind.error;
  if (anyKind.error) throw anyKind.error;
  return typicalSearchMinutes(sameKind.data, anyKind.data);
}

/**
 * Workers claim due searches in order, so a due search waiting an hour while no
 * search started or finished in that hour means new searches are not moving.
 */
async function searchStartsAreStalled(admin: OrgAgentAdminClient, now: Date) {
  const since = minutesBefore(now, STALLED_MINUTES);
  const [waiting, started, finished] = await Promise.all([
    runs(admin).select("id").eq("status", "queued").lte("available_at", since).limit(1),
    runs(admin).select("id").gte("started_at", since).limit(1),
    runs(admin).select("id").gte("finished_at", since).limit(1),
  ]);
  for (const result of [waiting, started, finished]) if (result.error) throw result.error;
  return Boolean(waiting.data?.length) && !started.data?.length && !finished.data?.length;
}

export async function readCompanySearchTiming(args: {
  admin: OrgAgentAdminClient;
  now?: Date;
  runId: string | null;
  status: "already_queued" | "already_running" | "queued";
}): Promise<CompanySearchTiming> {
  const now = args.now ?? new Date();
  const [startedAt, typicalMinutes, stalled] = await Promise.all([
    args.status === "already_running" && args.runId
      ? optional("started", async () => {
          const { data, error } = await runs(args.admin)
            .select("started_at").eq("id", args.runId).maybeSingle();
          if (error) throw error;
          const value = data?.started_at;
          return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
        })
      : null,
    optional("typical", () => readTypicalMinutes(args.admin, now, "company_requested")),
    optional("stalled", () => searchStartsAreStalled(args.admin, now)),
  ]);
  return {
    startedAt,
    startedMinutesAgo: startedAt
      ? Math.max(0, Math.round((now.getTime() - Date.parse(startedAt)) / 60_000))
      : null,
    startMayBeDelayed: stalled === true,
    typicalMinutes,
  };
}

/**
 * Workers start explicit requests first, then due searches by due time, and
 * one search per company at a time. Morning slots queue dozens of searches, so
 * a search due now can wait hours behind them.
 */
async function otherSearchesStartFirst(
  admin: OrgAgentAdminClient,
  now: Date,
  run: Record<string, unknown>
) {
  const [dueEarlier, requested, sameCompany] = await Promise.all([
    runs(admin).select("id").eq("status", "queued")
      .lt("available_at", String(run.available_at)).limit(1),
    runs(admin).select("id").eq("status", "queued")
      .eq("trigger_reason", "company_requested")
      .lte("available_at", now.toISOString()).limit(1),
    runs(admin).select("id").eq("status", "running")
      .eq("company_workspace_id", String(run.company_workspace_id)).limit(1),
  ]);
  for (const result of [dueEarlier, requested, sameCompany]) if (result.error) throw result.error;
  return [dueEarlier, requested, sameCompany].some(result => Boolean(result.data?.length));
}

/**
 * Activation queues one search per Role at its next allowed slot (Asia/Seoul).
 * Roles with no allowed slot, and Roles activated before, have none.
 */
export async function readRoleFirstSearchStart(args: {
  admin: OrgAgentAdminClient;
  now?: Date;
  roleId: string;
}): Promise<RoleFirstSearchStart | null> {
  const now = args.now ?? new Date();
  const run = await optional("role-first-search", async () => {
    const { data, error } = await runs(args.admin)
      .select("available_at,company_workspace_id,status")
      .eq("role_id", args.roleId)
      .eq("trigger_reason", "role_activated")
      .in("status", ["queued", "running"])
      .order("available_at", { ascending: true })
      .limit(1);
    if (error) throw error;
    return (data ?? [])[0] as Record<string, unknown> | undefined;
  });
  const startsAt = typeof run?.available_at === "string" ? run.available_at : "";
  if (!run || !Number.isFinite(Date.parse(startsAt))) return null;
  if (run.status === "running") return { startsAt, start: "now", startMayBeDelayed: false };
  if (Date.parse(startsAt) > now.getTime()) {
    return { startsAt, start: "scheduled", startMayBeDelayed: false };
  }
  const [othersFirst, stalled] = await Promise.all([
    optional("role-first-search-order", () => otherSearchesStartFirst(args.admin, now, run)),
    optional("stalled", () => searchStartsAreStalled(args.admin, now)),
  ]);
  return {
    startsAt,
    // An unreadable order is reported as waiting rather than promised now.
    start: othersFirst === false && stalled !== true ? "now" : "waiting",
    startMayBeDelayed: stalled === true,
  };
}
