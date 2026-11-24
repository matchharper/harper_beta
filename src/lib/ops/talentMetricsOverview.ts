import type {
  OpsTalentMetricFilters,
  OpsTalentMetricInterval,
} from "@/lib/ops/talentMetrics";

/** The signup channels the daily GTM report uses (growthTalentGtmReport). */
export const OVERVIEW_CHANNELS = [
  { key: "jobs", label: "공고" },
  { key: "seo", label: "검색" },
  { key: "linkedin", label: "링크드인" },
  { key: "threads", label: "스레드" },
  { key: "instagram_content", label: "인스타그램·콘텐츠" },
  { key: "agent_sourcing", label: "에이전트 소싱" },
  { key: "other", label: "기타" },
] as const;

export type OverviewChannelKey = (typeof OVERVIEW_CHANNELS)[number]["key"];

const DAY_MS = 24 * 60 * 60 * 1_000;
const FUNNEL_WINDOW_MS = 7 * DAY_MS;
const GMAIL_FAST_WINDOW_MS = DAY_MS;
const APPLY_FAST_WINDOW_MS = DAY_MS;
const APPLY_HARPER_WINDOW_MS = 4 * DAY_MS;

export type OpsTalentMetricOverviewSummary = {
  activeTalents: number;
  connectedTalents: number;
  externalConnections: number;
  internalConnections: number;
  /** Share of signups whose channel is the /jobs postings. null without signups. */
  jobsSignupShare: number | null;
  signups: number;
};

export type OpsTalentMetricOverviewTrendPoint = {
  activeTalents: number;
  /**
   * Signups in the bucket who clicked 지원하기 / 'Harper와 지원하기' in the apply modal within 24 hours of signing up,
   * out of all of them. A snapshot from an older build lacks these fields.
   */
  applyClickRate24h?: number | null;
  applyHarperRate24h?: number | null;
  /** The same within 96 hours: the share and the number of people. */
  applyHarperRate96h?: number | null;
  applyHarperTalents96h?: number;
  /** 'Harper와 지원하기' clicks. */
  applyDelegated: number;
  /** Applications the talent confirmed for Harper to carry out. */
  applyConfirmed: number;
  /** Of those confirmed in the bucket, the ones sent by Gmail or submitted on the site. */
  applySubmitted: number;
  applySuccessRate: number | null;
  bucketStart: string;
  externalConnections: number;
  fullLabel: string;
  /** Signups in the bucket who connected Gmail within 24 hours / 7 days of signing up, out of all of them. */
  gmailRate24h: number | null;
  gmailRate7d: number | null;
  internalConnections: number;
  label: string;
} & Record<`signups_${OverviewChannelKey}`, number>;

export type OpsTalentMetricOverviewFunnelStep = {
  count: number;
  key: "signup" | "firstChat" | "gmail" | "delegated" | "connected";
  label: string;
};

export type OpsTalentMetricOverviewChannelRow = {
  key: OverviewChannelKey;
  label: string;
  /** Signups in the period: the base of the rates. */
  signups: number;
  firstChatRate: number | null;
  gmailRate: number | null;
  delegatedRate: number | null;
  connectedRate: number | null;
};

export type OpsTalentMetricOverviewPostingRow = {
  companyName: string;
  delegated: number;
  isPublished: boolean;
  roleTitle: string;
  signups: number;
  slug: string;
};

export type OpsTalentMetricOverviewApplySite = {
  attempts: number;
  host: string;
  submitted: number;
};

export type OpsTalentMetricOverviewApplyFailure = {
  at: string;
  host: string | null;
  sentence: string | null;
  status: string;
};

export type OpsTalentMetricsOverviewResponse = {
  applyFailures: OpsTalentMetricOverviewApplyFailure[];
  applySites: OpsTalentMetricOverviewApplySite[];
  channels: OpsTalentMetricOverviewChannelRow[];
  comparison: OpsTalentMetricOverviewSummary;
  filters: OpsTalentMetricFilters;
  funnel: {
    /** Signups in the last 7 finished KST days of the period. */
    cohort: number;
    /** The cohort's signup days (KST, inclusive). */
    from: string;
    to: string;
    /** Median days from signup to the first connection, among cohort members who connected. */
    medianDaysToConnection: number | null;
    steps: OpsTalentMetricOverviewFunnelStep[];
  };
  generatedAt: string;
  pendingConnections: {
    buckets: Array<{ count: number; label: string }>;
    requests: number;
    talents: number;
  };
  postings: OpsTalentMetricOverviewPostingRow[];
  summary: OpsTalentMetricOverviewSummary;
  trend: OpsTalentMetricOverviewTrendPoint[];
};

export type OverviewSignupRow = {
  applyClickedAt: string | Date | null;
  applyHarperClickedAt: string | Date | null;
  bucketStart: string;
  connectedAt: string | Date | null;
  delegatedAt: string | Date | null;
  firstChatAt: string | Date | null;
  gmailAt: string | Date | null;
  inFunnel: boolean;
  isComparison: boolean;
  isCurrent: boolean;
  signedUpAt: string | Date;
  userId: string;
};

export type OverviewTrendRow = {
  activeTalents: number;
  applyDelegated: number;
  connectedTalents: number | null;
  externalConnections: number;
  internalConnections: number;
  key: string;
  rowType: "bucket" | "period";
};

export type OverviewApplicationRow = {
  at: string | Date;
  bucketStart: string;
  host: string | null;
  isCurrent: boolean;
  sentence: string | null;
  status: string;
  submitted: boolean;
};

export type OverviewPendingRow = { since: string | Date; talentId: string };

export type OverviewJobRow = {
  companyName: string | null;
  isPublished: boolean;
  roleTitle: string | null;
  slug: string;
};

export type OverviewAttribution = Map<
  string,
  { channel: OverviewChannelKey; jobSlug: string | null }
>;

function time(value: string | Date | null | undefined) {
  if (value === null || value === undefined) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function reachedWithin(
  signedUpAt: number,
  stepAt: string | Date | null,
  windowMs: number
) {
  const at = time(stepAt);
  return at !== null && at >= signedUpAt && at <= signedUpAt + windowMs;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bucketLabels(bucketStart: string, interval: OpsTalentMetricInterval) {
  const [year, month, day] = bucketStart.split("-");
  if (interval === "month") {
    return { fullLabel: `${year}.${month}`, label: `${year}.${month}` };
  }
  if (interval === "day") {
    return { fullLabel: bucketStart, label: `${month}.${day}` };
  }
  const start = new Date(`${bucketStart}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const endLabel = `${String(end.getUTCMonth() + 1).padStart(2, "0")}.${String(
    end.getUTCDate()
  ).padStart(2, "0")}`;
  return { fullLabel: `${month}.${day} - ${endLabel}`, label: `${month}.${day}` };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

/** The last 7 finished KST days up to the period's last day (the SQL's funnel_end_at). */
export function funnelDays(to: string, now: Date) {
  const today = new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  const endExclusive =
    to < today
      ? new Date(Date.parse(`${to}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
      : today;
  const endMs = Date.parse(`${endExclusive}T00:00:00Z`);
  return {
    from: new Date(endMs - 7 * DAY_MS).toISOString().slice(0, 10),
    to: new Date(endMs - DAY_MS).toISOString().slice(0, 10),
  };
}

const TWO_LEVEL_SUFFIXES = new Set([
  "co.kr", "or.kr", "ac.kr", "co.jp", "co.uk", "co.id", "co.in", "com.sg", "com.au", "com.hk", "com.tw", "com.cn",
]);

/** The site a posting lives on: its host without subdomains (job-boards.eu.greenhouse.io → greenhouse.io). */
export function applySiteOf(host: string | null) {
  const parts = (host ?? "").toLowerCase().split(".").filter(Boolean);
  if (parts.length < 2) return host || "알 수 없음";
  const lastTwo = parts.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) && parts.length >= 3
    ? parts.slice(-3).join(".")
    : lastTwo;
}

const PENDING_BUCKETS = [
  { label: "0~2일", maxDays: 3 },
  { label: "3~6일", maxDays: 7 },
  { label: "7일 이상", maxDays: Number.POSITIVE_INFINITY },
];

export function buildOpsTalentMetricsOverview(args: {
  applications: OverviewApplicationRow[];
  attribution: OverviewAttribution;
  filters: OpsTalentMetricFilters;
  generatedAt: Date;
  jobs: OverviewJobRow[];
  pending: OverviewPendingRow[];
  signups: OverviewSignupRow[];
  trendRows: OverviewTrendRow[];
}): OpsTalentMetricsOverviewResponse {
  const now = args.generatedAt.getTime();
  const channelOf = (userId: string): OverviewChannelKey =>
    args.attribution.get(userId)?.channel ?? "other";

  const currentSignups = args.signups.filter((row) => row.isCurrent);
  const comparisonSignups = args.signups.filter((row) => row.isComparison);
  const funnelSignups = args.signups.filter((row) => row.inFunnel);
  const funnelWindow = funnelDays(args.filters.to, args.generatedAt);
  // "가입 7일 안" counts every signup and what they reached in their first 7 days. A signup still inside those days
  // counts with what they did so far, so the latest buckets rise as their days fill.
  const within = (row: OverviewSignupRow, key: keyof OverviewSignupRow) =>
    reachedWithin(
      time(row.signedUpAt) ?? 0,
      row[key] as string | Date | null,
      FUNNEL_WINDOW_MS
    );

  const periodRow = (key: string) =>
    args.trendRows.find((row) => row.rowType === "period" && row.key === key);
  const summaryFor = (
    key: "current" | "comparison",
    signups: OverviewSignupRow[]
  ): OpsTalentMetricOverviewSummary => {
    const row = periodRow(key);
    const jobsSignups =
      key === "current"
        ? signups.filter((signup) => channelOf(signup.userId) === "jobs").length
        : null;
    return {
      activeTalents: row?.activeTalents ?? 0,
      connectedTalents: row?.connectedTalents ?? 0,
      externalConnections: row?.externalConnections ?? 0,
      internalConnections: row?.internalConnections ?? 0,
      jobsSignupShare:
        jobsSignups === null ? null : rate(jobsSignups, signups.length),
      signups: signups.length,
    };
  };

  const trend = args.trendRows
    .filter((row) => row.rowType === "bucket")
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => {
      const bucketSignups = currentSignups.filter(
        (signup) => signup.bucketStart === row.key
      );
      const bucketApplications = args.applications.filter(
        (application) =>
          application.isCurrent && application.bucketStart === row.key
      );
      const applySubmitted = bucketApplications.filter(
        (application) => application.submitted
      ).length;
      const channelCounts = Object.fromEntries(
        OVERVIEW_CHANNELS.map((channel) => [
          `signups_${channel.key}`,
          bucketSignups.filter(
            (signup) => channelOf(signup.userId) === channel.key
          ).length,
        ])
      ) as Record<`signups_${OverviewChannelKey}`, number>;
      const reached = (key: keyof OverviewSignupRow, windowMs: number) =>
        bucketSignups.filter((signup) =>
          reachedWithin(
            time(signup.signedUpAt) ?? 0,
            signup[key] as string | Date | null,
            windowMs
          )
        ).length;
      const applyHarperTalents96h = reached(
        "applyHarperClickedAt",
        APPLY_HARPER_WINDOW_MS
      );
      return {
        ...bucketLabels(row.key, args.filters.interval),
        ...channelCounts,
        activeTalents: row.activeTalents,
        applyClickRate24h: rate(
          reached("applyClickedAt", APPLY_FAST_WINDOW_MS),
          bucketSignups.length
        ),
        applyHarperRate24h: rate(
          reached("applyHarperClickedAt", APPLY_FAST_WINDOW_MS),
          bucketSignups.length
        ),
        applyHarperRate96h: rate(applyHarperTalents96h, bucketSignups.length),
        applyHarperTalents96h,
        applyConfirmed: bucketApplications.length,
        applyDelegated: row.applyDelegated,
        applySubmitted,
        applySuccessRate: rate(applySubmitted, bucketApplications.length),
        bucketStart: row.key,
        externalConnections: row.externalConnections,
        gmailRate24h: rate(
          bucketSignups.filter((signup) =>
            reachedWithin(
              time(signup.signedUpAt) ?? 0,
              signup.gmailAt,
              GMAIL_FAST_WINDOW_MS
            )
          ).length,
          bucketSignups.length
        ),
        gmailRate7d: rate(
          bucketSignups.filter((signup) => within(signup, "gmailAt")).length,
          bucketSignups.length
        ),
        internalConnections: row.internalConnections,
      };
    });

  const funnelSteps: OpsTalentMetricOverviewFunnelStep[] = [
    { count: funnelSignups.length, key: "signup", label: "가입" },
    {
      count: funnelSignups.filter((row) => within(row, "firstChatAt")).length,
      key: "firstChat",
      label: "첫 대화",
    },
    {
      count: funnelSignups.filter((row) => within(row, "gmailAt")).length,
      key: "gmail",
      label: "Gmail 연동",
    },
    {
      count: funnelSignups.filter((row) => within(row, "delegatedAt")).length,
      key: "delegated",
      label: "맡김",
    },
    {
      count: funnelSignups.filter((row) => within(row, "connectedAt")).length,
      key: "connected",
      label: "연결",
    },
  ];
  const daysToConnection = funnelSignups
    .filter((row) => within(row, "connectedAt"))
    .map(
      (row) =>
        ((time(row.connectedAt) ?? 0) - (time(row.signedUpAt) ?? 0)) / DAY_MS
    );

  const channels = OVERVIEW_CHANNELS.map((channel) => {
    const signups = currentSignups.filter(
      (row) => channelOf(row.userId) === channel.key
    );
    const share = (key: keyof OverviewSignupRow) =>
      rate(signups.filter((row) => within(row, key)).length, signups.length);
    return {
      connectedRate: share("connectedAt"),
      delegatedRate: share("delegatedAt"),
      firstChatRate: share("firstChatAt"),
      gmailRate: share("gmailAt"),
      key: channel.key,
      label: channel.label,
      signups: signups.length,
    };
  });

  const jobsBySlug = new Map(args.jobs.map((job) => [job.slug, job]));
  const postingCounts = new Map<string, { delegated: number; signups: number }>();
  for (const row of currentSignups) {
    const slug = args.attribution.get(row.userId)?.jobSlug;
    if (!slug) continue;
    const counts = postingCounts.get(slug) ?? { delegated: 0, signups: 0 };
    counts.signups += 1;
    if (time(row.delegatedAt) !== null) counts.delegated += 1;
    postingCounts.set(slug, counts);
  }
  const postings = Array.from(postingCounts, ([slug, counts]) => {
    const job = jobsBySlug.get(slug);
    return {
      ...counts,
      companyName: job?.companyName ?? "",
      isPublished: job?.isPublished ?? false,
      roleTitle: job?.roleTitle ?? slug,
      slug,
    };
  }).sort((a, b) => b.signups - a.signups || a.slug.localeCompare(b.slug));

  const currentApplications = args.applications.filter((row) => row.isCurrent);
  const sites = new Map<string, OpsTalentMetricOverviewApplySite>();
  for (const application of currentApplications) {
    const host = applySiteOf(application.host);
    const site = sites.get(host) ?? { attempts: 0, host, submitted: 0 };
    site.attempts += 1;
    if (application.submitted) site.submitted += 1;
    sites.set(host, site);
  }
  const applySites = Array.from(sites.values()).sort(
    (a, b) =>
      a.submitted / a.attempts - b.submitted / b.attempts ||
      b.attempts - a.attempts
  );
  const applyFailures = currentApplications
    .filter((row) => !row.submitted)
    .sort((a, b) => (time(b.at) ?? 0) - (time(a.at) ?? 0))
    .slice(0, 8)
    .map((row) => ({
      at: new Date(row.at).toISOString(),
      host: row.host,
      sentence: row.sentence,
      status: row.status,
    }));

  const waitingDays = args.pending.map(
    (row) => (now - (time(row.since) ?? now)) / DAY_MS
  );
  const pendingBuckets = PENDING_BUCKETS.map((bucket, index) => {
    const minDays = index === 0 ? 0 : PENDING_BUCKETS[index - 1].maxDays;
    return {
      count: waitingDays.filter((days) => days >= minDays && days < bucket.maxDays)
        .length,
      label: bucket.label,
    };
  });

  return {
    applyFailures,
    applySites,
    channels,
    comparison: summaryFor("comparison", comparisonSignups),
    filters: args.filters,
    funnel: {
      cohort: funnelSignups.length,
      from: funnelWindow.from,
      to: funnelWindow.to,
      medianDaysToConnection: median(daysToConnection),
      steps: funnelSteps,
    },
    generatedAt: args.generatedAt.toISOString(),
    pendingConnections: {
      buckets: pendingBuckets,
      requests: args.pending.length,
      talents: new Set(args.pending.map((row) => row.talentId)).size,
    },
    postings,
    summary: summaryFor("current", currentSignups),
    trend,
  };
}
