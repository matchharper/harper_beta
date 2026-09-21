import {
  DEFAULT_ADMIN_EXCLUDED_EMAILS,
  isEmailExcluded,
} from "@/lib/adminEmailExclusions";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import {
  CAREER_LANDING_SESSION_GAP_MS,
  normalizeCareerUtmSource,
  readCareerSourceFromReferrer,
  readCareerUtmParamsFromSearch,
  readCareerUtmSourceFromSearch,
  type CareerUtmParams,
} from "@/lib/career/utm";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
} from "@/lib/officialJobs";
import {
  OFFICIAL_JOBS_LANDING_SOURCE,
  parseOfficialJobLandingLogType,
} from "@/lib/officialJobs/landingLogs";
import {
  extractEmailFromLandingLoginType,
  getLandingLogSource,
  isLandingLogEntryType,
} from "@/lib/landingLogTypes";
import type { Database } from "@/types/database.types";

const BATCH_SIZE = 1000;
const VALUE_CHUNK_SIZE = 250;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const ATTRIBUTION_LOOKBACK_DAYS = 365;
const UTM_ATTRIBUTION_MAX_GAP_MS = CAREER_LANDING_SESSION_GAP_MS;
const ANALYTICS_TEST_FIXTURE_TALENT_LOG_TYPE =
  "analytics_excluded_test_fixture_talent";

export const TALENT_GTM_CHANNEL_KEYS = [
  "linkedin",
  "jobs",
  "threads",
  "instagram_content",
  "seo",
  "other",
] as const;

export type TalentGtmChannelKey = (typeof TALENT_GTM_CHANNEL_KEYS)[number];
export type TalentGtmMetricKey =
  | "uniqueUsers"
  | "signups"
  | "onboardingCompleted";

export type TalentGtmCounts = {
  onboardingCompleted: number;
  signups: number;
  uniqueUsers: number;
};

export type TalentGtmChannelRow = {
  current: TalentGtmCounts;
  lastWeekUniqueUsers: number;
  key: TalentGtmChannelKey;
  label: string;
  yesterday: TalentGtmCounts;
};

export type TalentGtmJobRow = {
  companyName: string;
  isPublished: boolean;
  onboardingCompleted: number;
  roleTitle: string;
  signups: number;
  slug: string;
  uniqueUsers: number;
};

export type TalentGtmContentRow = TalentGtmCounts & {
  campaign: string;
  content: string;
  medium: string;
  source: string;
};

export type TalentGtmSourceRow = TalentGtmCounts & {
  source: string;
};

export type TalentGtmReport = {
  channels: TalentGtmChannelRow[];
  contentRows: TalentGtmContentRow[];
  date: string;
  generatedAt: string;
  jobRows: TalentGtmJobRow[];
  otherSourceRows: TalentGtmSourceRow[];
  overall: {
    current: TalentGtmCounts;
    lastWeek: TalentGtmCounts;
    yesterday: TalentGtmCounts;
  };
  weekComparisonDate: string;
  yesterdayDate: string;
};

type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "created_at" | "local_id" | "type"
>;

type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "email" | "user_id"
>;

type SignupLogRow = Pick<
  Database["public"]["Tables"]["logs"]["Row"],
  "created_at" | "user_id"
>;

type TalentActivityRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "created_at" | "event_type" | "source" | "talent_id"
>;

type OfficialJobRow = Pick<
  Database["public"]["Tables"]["official_jobs"]["Row"],
  "company_name" | "is_published" | "role_title" | "slug"
>;

type OfficialJobEventRow = Pick<
  Database["public"]["Tables"]["official_job_events"]["Row"],
  "anonymous_id" | "created_at" | "path" | "referrer"
>;

type JobAcquisition = {
  createdAt: string;
  source: string;
  utm: CareerUtmParams | null;
};

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type ParsedUtmLog = {
  createdAt: string;
  params: CareerUtmParams;
};

type JobTouch = {
  createdAt: string;
  event: "job_view" | "talk_click";
  slug: string;
};

type MetricRecord = {
  at: string;
  channel: TalentGtmChannelKey;
  date: string;
  entityId: string;
  jobSlug: string | null;
  kind: TalentGtmMetricKey;
  localId: string | null;
  source: string;
  utm: CareerUtmParams | null;
};

type ReportInput = {
  entryLogs: LandingLogRow[];
  excludedEmails: string[];
  excludedUserIds: Set<string>;
  identityLogs: LandingLogRow[];
  jobEventLogs: LandingLogRow[];
  jobs: OfficialJobRow[];
  onboardingEvents: TalentActivityRow[];
  officialJobIntentEvents: TalentActivityRow[];
  officialJobEvents?: OfficialJobEventRow[];
  signupLogs: SignupLogRow[];
  targetDate: string;
  talentUsers: TalentUserRow[];
  utmLogs: LandingLogRow[];
};

type SlackRawTextCell = { text: string; type: "raw_text" };
type SlackTableBlock = {
  column_settings: Array<{
    align?: "left" | "right";
    is_wrapped?: boolean;
  } | null>;
  rows: SlackRawTextCell[][];
  type: "table";
};

export type TalentGtmSlackMessage = {
  blocks?: Array<Record<string, unknown> | SlackTableBlock>;
  text: string;
};

export type TalentGtmSlackMessages = {
  content: TalentGtmSlackMessage;
  jobs: TalentGtmSlackMessage;
  main: TalentGtmSlackMessage;
  notes: TalentGtmSlackMessage;
};

const CHANNEL_LABELS: Record<TalentGtmChannelKey, string> = {
  instagram_content: "Instagram·콘텐츠",
  jobs: "Jobs",
  linkedin: "LinkedIn",
  other: "기타",
  seo: "SEO",
  threads: "Threads",
};

function emptyCounts(): TalentGtmCounts {
  return { onboardingCompleted: 0, signups: 0, uniqueUsers: 0 };
}

function normalizeDateOnly(value: unknown) {
  const date = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function addTalentGtmDateDays(date: string, days: number) {
  const normalized = normalizeDateOnly(date);
  if (!normalized) throw new Error("date must be YYYY-MM-DD");
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12))
    .toISOString()
    .slice(0, 10);
}

function getKstDateOnly(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function getDefaultTalentGtmReportDate(now = new Date()) {
  return addTalentGtmDateDays(getKstDateOnly(now), -1);
}

export function resolveTalentGtmReportDate(value: unknown, now = new Date()) {
  return normalizeDateOnly(value) ?? getDefaultTalentGtmReportDate(now);
}

function getKstRange(startDate: string, days: number) {
  const normalized = normalizeDateOnly(startDate);
  if (!normalized || !Number.isInteger(days) || days <= 0) {
    throw new Error("A valid start date and positive day count are required");
  }
  const [year, month, day] = normalized.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -9));
  const end = new Date(Date.UTC(year, month - 1, day + days, -9));
  return { endIso: end.toISOString(), startIso: start.toISOString() };
}

function toKstDateKey(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

async function fetchAllRows<T>(
  loadPage: (from: number, to: number) => PromiseLike<FetchPageResult<T>>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const { data, error } = await loadPage(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < BATCH_SIZE) return rows;
  }
}

async function fetchRowsForValues<T>(
  values: Iterable<string>,
  loadPage: (
    values: string[],
    from: number,
    to: number
  ) => PromiseLike<FetchPageResult<T>>
) {
  const unique = Array.from(
    new Set(Array.from(values, (value) => value.trim()).filter(Boolean))
  );
  const rows: T[] = [];
  for (let index = 0; index < unique.length; index += VALUE_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + VALUE_CHUNK_SIZE);
    rows.push(
      ...(await fetchAllRows<T>((from, to) => loadPage(chunk, from, to)))
    );
  }
  return rows;
}

function parseUtmLogType(value: string | null | undefined) {
  const type = String(value ?? "").trim();
  if (!type.startsWith("utm:")) return null;
  const search = new URLSearchParams(type.slice(4));
  const source = normalizeCareerUtmSource(search.get("utm_source"));
  if (!source) return null;

  const params: CareerUtmParams = { utm_source: source };
  for (const key of [
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ] as const) {
    const item = String(search.get(key) ?? "").trim();
    if (item) params[key] = item.slice(0, 120);
  }
  return params;
}

function buildUtmLogsByLocalId(logs: LandingLogRow[]) {
  const result = new Map<string, ParsedUtmLog[]>();
  for (const log of logs) {
    const localId = String(log.local_id ?? "").trim();
    const params = parseUtmLogType(log.type);
    if (!localId || !params) continue;
    const values = result.get(localId) ?? [];
    values.push({ createdAt: log.created_at, params });
    result.set(localId, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  return result;
}

function findClosestUtm(at: string, values: ParsedUtmLog[] | undefined) {
  if (!values?.length) return null;
  const timestamp = new Date(at).getTime();
  let closest: ParsedUtmLog | null = null;
  let distance = Number.POSITIVE_INFINITY;

  for (const value of values) {
    const nextDistance = Math.abs(
      new Date(value.createdAt).getTime() - timestamp
    );
    if (nextDistance > UTM_ATTRIBUTION_MAX_GAP_MS) continue;
    if (nextDistance < distance) {
      closest = value;
      distance = nextDistance;
    }
  }
  return closest?.params ?? null;
}

function buildJobAcquisitionsByLocalId(events: OfficialJobEventRow[]) {
  const eventsByLocalId = new Map<string, OfficialJobEventRow[]>();
  for (const event of events) {
    if (!event.anonymous_id) continue;
    const values = eventsByLocalId.get(event.anonymous_id) ?? [];
    values.push(event);
    eventsByLocalId.set(event.anonymous_id, values);
  }
  const result = new Map<string, JobAcquisition[]>();
  for (const [localId, values] of eventsByLocalId) {
    values.sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
    const acquisitions: JobAcquisition[] = [];
    for (const event of values) {
      const previous = acquisitions.at(-1);
      const sameSession =
        previous &&
        new Date(event.created_at).getTime() -
          new Date(previous.createdAt).getTime() <
          UTM_ATTRIBUTION_MAX_GAP_MS;
      let source = sameSession ? previous.source : OFFICIAL_JOBS_LANDING_SOURCE;
      let utm = sameSession ? previous.utm : null;
      let eventUtm: CareerUtmParams | null = null;
      try {
        const search = new URL(event.path ?? "", "https://matchharper.com")
          .search;
        eventUtm = readCareerUtmParamsFromSearch(search);
        const explicitSource =
          eventUtm?.utm_source ?? readCareerUtmSourceFromSearch(search);
        if (explicitSource)
          eventUtm = { ...eventUtm, utm_source: explicitSource };
      } catch {
        // An invalid path can still have a useful recorded referrer.
      }
      const referrerSource = readCareerSourceFromReferrer(event.referrer);
      if (
        eventUtm?.utm_source &&
        eventUtm.utm_source !== OFFICIAL_JOBS_LANDING_SOURCE
      ) {
        source = eventUtm.utm_source;
        utm = eventUtm;
      } else if (referrerSource && !utm?.utm_source) {
        source = referrerSource;
      }
      acquisitions.push({ createdAt: event.created_at, source, utm });
    }
    result.set(localId, acquisitions);
  }
  return result;
}

function findJobAcquisition(
  at: string,
  values: JobAcquisition[] | undefined,
  allowFollowing: boolean
) {
  if (!values?.length) return null;
  const timestamp = new Date(at).getTime();
  let prior: JobAcquisition | null = null;
  for (const value of values) {
    const gap = new Date(value.createdAt).getTime() - timestamp;
    if (gap <= 0) {
      if (-gap < UTM_ATTRIBUTION_MAX_GAP_MS) prior = value;
      continue;
    }
    // Entry logs and the matching page event are written asynchronously.
    return (
      prior ??
      (allowFollowing && gap < UTM_ATTRIBUTION_MAX_GAP_MS ? value : null)
    );
  }
  return prior;
}

function buildJobTouchesByLocalId(logs: LandingLogRow[]) {
  const result = new Map<string, JobTouch[]>();
  for (const log of logs) {
    const localId = String(log.local_id ?? "").trim();
    const parsed = parseOfficialJobLandingLogType(log.type);
    if (
      !localId ||
      !parsed?.jobSlug ||
      (parsed.event !== "job_view" && parsed.event !== "talk_click")
    ) {
      continue;
    }
    const values = result.get(localId) ?? [];
    values.push({
      createdAt: log.created_at,
      event: parsed.event,
      slug: parsed.jobSlug,
    });
    result.set(localId, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  return result;
}

function findLatestJobSlug(
  values: JobTouch[] | undefined,
  at: string,
  options: { sameKstDate?: boolean } = {}
) {
  if (!values?.length) return null;
  const timestamp = new Date(at).getTime();
  const date = toKstDateKey(at);
  let result: JobTouch | null = null;
  for (const value of values) {
    if (value.event !== "job_view") continue;
    if (options.sameKstDate && toKstDateKey(value.createdAt) !== date) continue;
    if (
      !options.sameKstDate &&
      new Date(value.createdAt).getTime() > timestamp
    ) {
      continue;
    }
    if (!result || value.createdAt > result.createdAt) result = value;
  }
  return result?.slug ?? null;
}

function parseOfficialJobIntentSlug(source: string | null | undefined) {
  const value = String(source ?? "").trim();
  for (const prefix of ["official_jobs_onboarding:", "official_jobs:"]) {
    if (value.startsWith(prefix)) return value.slice(prefix.length) || null;
  }
  return null;
}

function buildJobIntentsByUserId(rows: TalentActivityRow[]) {
  const result = new Map<string, Array<{ createdAt: string; slug: string }>>();
  for (const row of rows) {
    const userId = String(row.talent_id ?? "").trim();
    const slug = parseOfficialJobIntentSlug(row.source);
    if (!userId || !slug) continue;
    const values = result.get(userId) ?? [];
    values.push({ createdAt: row.created_at, slug });
    result.set(userId, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }
  return result;
}

function findJobIntentSlug(
  rows: Array<{ createdAt: string; slug: string }> | undefined,
  at: string
) {
  if (!rows?.length) return null;
  const eventDate = toKstDateKey(at);
  const sameDay = rows.filter(
    (row) => toKstDateKey(row.createdAt) === eventDate
  );
  if (sameDay.length > 0) return sameDay[sameDay.length - 1]?.slug ?? null;
  const prior = rows.filter((row) => row.createdAt <= at);
  return prior[prior.length - 1]?.slug ?? null;
}

export function classifyTalentGtmChannel(args: {
  source: string | null | undefined;
  utmSource?: string | null;
}): TalentGtmChannelKey {
  const landingSource = normalizeCareerUtmSource(args.source) ?? "";
  const source =
    normalizeCareerUtmSource(args.utmSource ?? landingSource) ?? "";
  if (source === OFFICIAL_JOBS_LANDING_SOURCE) return "jobs";
  if (source.includes("linkedin") || source === "lnkd_in") return "linkedin";
  if (source.includes("threads")) return "threads";
  if (
    source.includes("instagram") ||
    source.includes("instantdm") ||
    source === "dm" ||
    /^contents?\d+[a-z0-9_-]*$/.test(source)
  ) {
    return "instagram_content";
  }
  if (
    source === "seo" ||
    ["bing", "daum", "duckduckgo", "google", "naver", "yahoo"].includes(source)
  ) {
    return "seo";
  }
  return "other";
}

function buildIdentityLogsByEmail(logs: LandingLogRow[]) {
  const result = new Map<string, LandingLogRow[]>();
  for (const log of logs) {
    const email = normalizeEmail(extractEmailFromLandingLoginType(log.type));
    if (!email) continue;
    const values = result.get(email) ?? [];
    values.push(log);
    result.set(email, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) =>
      left.created_at.localeCompare(right.created_at)
    );
  }
  return result;
}

function findLatestIdentityLog(rows: LandingLogRow[] | undefined, at: string) {
  if (!rows?.length) return null;
  let result: LandingLogRow | null = null;
  for (const row of rows) {
    if (row.created_at > at) break;
    result = row;
  }
  return result;
}

function buildExcludedLocalIds(args: {
  excludedEmails: string[];
  excludedUserIds: Set<string>;
  identityLogs: LandingLogRow[];
  talentUsers: TalentUserRow[];
}) {
  const excludedEmails = new Set(args.excludedEmails);
  for (const user of args.talentUsers) {
    if (!args.excludedUserIds.has(user.user_id)) continue;
    const email = normalizeEmail(user.email);
    if (email) excludedEmails.add(email);
  }

  const localIds = new Set<string>();
  for (const log of args.identityLogs) {
    const localId = String(log.local_id ?? "").trim();
    const email = normalizeEmail(extractEmailFromLandingLoginType(log.type));
    if (localId && email && isEmailExcluded(email, excludedEmails)) {
      localIds.add(localId);
    }
  }
  return { excludedEmails, localIds };
}

function channelForRecord(args: {
  source: string;
  utm: CareerUtmParams | null;
}) {
  return classifyTalentGtmChannel({
    source: args.source,
    utmSource: args.utm?.utm_source,
  });
}

function buildMetricRecords(input: ReportInput) {
  const userById = new Map(
    input.talentUsers.map((user) => [user.user_id, user])
  );
  const identityByEmail = buildIdentityLogsByEmail(input.identityLogs);
  const utmByLocalId = buildUtmLogsByLocalId(input.utmLogs);
  const jobAcquisitionsByLocalId = buildJobAcquisitionsByLocalId(
    input.officialJobEvents ?? []
  );
  const jobTouchesByLocalId = buildJobTouchesByLocalId(input.jobEventLogs);
  const jobIntentsByUserId = buildJobIntentsByUserId(
    input.officialJobIntentEvents
  );
  const { excludedEmails, localIds: excludedLocalIds } = buildExcludedLocalIds({
    excludedEmails: input.excludedEmails,
    excludedUserIds: input.excludedUserIds,
    identityLogs: input.identityLogs,
    talentUsers: input.talentUsers,
  });
  const records: MetricRecord[] = [];

  const resolveAcquisition = (
    source: string,
    localId: string | null,
    at: string,
    isEntry: boolean
  ) => {
    const utm = localId ? findClosestUtm(at, utmByLocalId.get(localId)) : null;
    const job =
      source === OFFICIAL_JOBS_LANDING_SOURCE && localId
        ? findJobAcquisition(at, jobAcquisitionsByLocalId.get(localId), isEntry)
        : null;
    // The Jobs route marker is not an external acquisition source.
    const explicitUtm =
      utm?.utm_source !== OFFICIAL_JOBS_LANDING_SOURCE ? utm : null;
    return {
      source: job?.source ?? source,
      utm: explicitUtm ?? job?.utm ?? (job ? null : utm),
    };
  };

  const entryByLocalIdAndDate = new Map<string, LandingLogRow>();
  for (const entry of input.entryLogs) {
    const localId = String(entry.local_id ?? "").trim();
    if (
      !localId ||
      excludedLocalIds.has(localId) ||
      !isLandingLogEntryType(entry.type)
    ) {
      continue;
    }
    const date = toKstDateKey(entry.created_at);
    const key = `${date}:${localId}`;
    const existing = entryByLocalIdAndDate.get(key);
    if (!existing || entry.created_at > existing.created_at) {
      entryByLocalIdAndDate.set(key, entry);
    }
  }

  for (const entry of entryByLocalIdAndDate.values()) {
    const localId = String(entry.local_id ?? "").trim();
    const source =
      normalizeCareerUtmSource(getLandingLogSource(entry.type)) ?? "unknown";
    const acquisition = resolveAcquisition(
      source,
      localId,
      entry.created_at,
      true
    );
    const jobSlug =
      source === OFFICIAL_JOBS_LANDING_SOURCE
        ? findLatestJobSlug(
            jobTouchesByLocalId.get(localId),
            entry.created_at,
            {
              sameKstDate: true,
            }
          )
        : null;
    records.push({
      at: entry.created_at,
      channel: channelForRecord(acquisition),
      date: toKstDateKey(entry.created_at),
      entityId: localId,
      jobSlug,
      kind: "uniqueUsers",
      localId,
      ...acquisition,
    });
  }

  const addUserEvent = (
    userId: string | null | undefined,
    at: string,
    kind: "onboardingCompleted" | "signups"
  ) => {
    const normalizedUserId = String(userId ?? "").trim();
    const user = userById.get(normalizedUserId);
    const email = normalizeEmail(user?.email);
    if (
      !normalizedUserId ||
      input.excludedUserIds.has(normalizedUserId) ||
      !email ||
      isEmailExcluded(email, excludedEmails)
    ) {
      return;
    }
    const identity = findLatestIdentityLog(identityByEmail.get(email), at);
    const localId = String(identity?.local_id ?? "").trim() || null;
    const source =
      normalizeCareerUtmSource(getLandingLogSource(identity?.type)) ??
      "unknown";
    const acquisition = resolveAcquisition(
      source,
      localId,
      identity?.created_at ?? at,
      false
    );
    const jobSlug =
      source === OFFICIAL_JOBS_LANDING_SOURCE
        ? (findJobIntentSlug(jobIntentsByUserId.get(normalizedUserId), at) ??
          (localId
            ? findLatestJobSlug(jobTouchesByLocalId.get(localId), at)
            : null))
        : null;
    records.push({
      at,
      channel: channelForRecord(acquisition),
      date: toKstDateKey(at),
      entityId: normalizedUserId,
      jobSlug,
      kind,
      localId,
      ...acquisition,
    });
  };

  for (const signup of input.signupLogs) {
    addUserEvent(signup.user_id, signup.created_at, "signups");
  }
  for (const event of input.onboardingEvents) {
    addUserEvent(event.talent_id, event.created_at, "onboardingCompleted");
  }

  return { excludedLocalIds, jobTouchesByLocalId, records };
}

function countRecords(
  records: MetricRecord[],
  args: {
    channel?: TalentGtmChannelKey;
    endDate: string;
    startDate: string;
  }
) {
  const sets: Record<TalentGtmMetricKey, Set<string>> = {
    onboardingCompleted: new Set(),
    signups: new Set(),
    uniqueUsers: new Set(),
  };
  for (const record of records) {
    if (record.date < args.startDate || record.date > args.endDate) continue;
    if (args.channel && record.channel !== args.channel) continue;
    sets[record.kind].add(record.entityId);
  }
  return {
    onboardingCompleted: sets.onboardingCompleted.size,
    signups: sets.signups.size,
    uniqueUsers: sets.uniqueUsers.size,
  };
}

function buildContentRows(records: MetricRecord[], date: string) {
  const groups = new Map<
    string,
    {
      campaign: string;
      content: string;
      medium: string;
      sets: Record<TalentGtmMetricKey, Set<string>>;
      source: string;
    }
  >();
  for (const record of records) {
    if (record.date !== date || record.channel !== "instagram_content")
      continue;
    const source = record.utm?.utm_source ?? record.source;
    const medium = record.utm?.utm_medium ?? "-";
    const campaign = record.utm?.utm_campaign ?? "-";
    const content =
      record.utm?.utm_content ?? (source.match(/^contents?\d+/) ? source : "-");
    const key = [source, medium, campaign, content].join("\u0000");
    const group = groups.get(key) ?? {
      campaign,
      content,
      medium,
      sets: {
        onboardingCompleted: new Set<string>(),
        signups: new Set<string>(),
        uniqueUsers: new Set<string>(),
      },
      source,
    };
    group.sets[record.kind].add(record.entityId);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => ({
      campaign: group.campaign,
      content: group.content,
      medium: group.medium,
      onboardingCompleted: group.sets.onboardingCompleted.size,
      signups: group.sets.signups.size,
      source: group.source,
      uniqueUsers: group.sets.uniqueUsers.size,
    }))
    .sort(
      (left, right) =>
        right.uniqueUsers - left.uniqueUsers ||
        right.signups - left.signups ||
        left.content.localeCompare(right.content)
    );
}

function buildOtherSourceRows(records: MetricRecord[], date: string) {
  const groups = new Map<string, Record<TalentGtmMetricKey, Set<string>>>();
  for (const record of records) {
    if (record.date !== date || record.channel !== "other") continue;
    const source = record.utm?.utm_source ?? record.source ?? "unknown";
    const sets = groups.get(source) ?? {
      onboardingCompleted: new Set<string>(),
      signups: new Set<string>(),
      uniqueUsers: new Set<string>(),
    };
    sets[record.kind].add(record.entityId);
    groups.set(source, sets);
  }
  return Array.from(groups, ([source, sets]) => ({
    onboardingCompleted: sets.onboardingCompleted.size,
    signups: sets.signups.size,
    source,
    uniqueUsers: sets.uniqueUsers.size,
  })).sort(
    (left, right) =>
      right.uniqueUsers - left.uniqueUsers ||
      right.signups - left.signups ||
      left.source.localeCompare(right.source)
  );
}

function buildJobRows(args: {
  date: string;
  excludedLocalIds: Set<string>;
  jobTouchesByLocalId: Map<string, JobTouch[]>;
  jobs: OfficialJobRow[];
  records: MetricRecord[];
}) {
  const viewSets = new Map<string, Set<string>>();
  const clickSets = new Map<string, Set<string>>();
  for (const [localId, touches] of args.jobTouchesByLocalId) {
    if (args.excludedLocalIds.has(localId)) continue;
    for (const touch of touches) {
      if (toKstDateKey(touch.createdAt) !== args.date) continue;
      const map = touch.event === "job_view" ? viewSets : clickSets;
      const set = map.get(touch.slug) ?? new Set<string>();
      set.add(localId);
      map.set(touch.slug, set);
    }
  }

  const signupSets = new Map<string, Set<string>>();
  const onboardingSets = new Map<string, Set<string>>();
  for (const record of args.records) {
    if (record.date !== args.date || !record.jobSlug) continue;
    if (record.kind !== "signups" && record.kind !== "onboardingCompleted") {
      continue;
    }
    const map = record.kind === "signups" ? signupSets : onboardingSets;
    const set = map.get(record.jobSlug) ?? new Set<string>();
    set.add(record.entityId);
    map.set(record.jobSlug, set);
  }

  const activitySlugs = new Set([
    ...viewSets.keys(),
    ...clickSets.keys(),
    ...signupSets.keys(),
    ...onboardingSets.keys(),
  ]);
  const jobsBySlug = new Map(args.jobs.map((job) => [job.slug, job] as const));
  const slugs = new Set([
    ...args.jobs.filter((job) => job.is_published).map((job) => job.slug),
    ...activitySlugs,
  ]);

  return Array.from(slugs, (slug): TalentGtmJobRow => {
    const job = jobsBySlug.get(slug);
    return {
      companyName: job?.company_name ?? "-",
      isPublished: job?.is_published === true,
      onboardingCompleted: onboardingSets.get(slug)?.size ?? 0,
      roleTitle: job?.role_title ?? slug,
      signups: signupSets.get(slug)?.size ?? 0,
      slug,
      uniqueUsers: viewSets.get(slug)?.size ?? 0,
    };
  }).sort(
    (left, right) =>
      right.uniqueUsers - left.uniqueUsers ||
      right.signups - left.signups ||
      Number(right.isPublished) - Number(left.isPublished) ||
      left.roleTitle.localeCompare(right.roleTitle)
  );
}

export function buildTalentGtmReportFromRows(
  input: ReportInput
): TalentGtmReport {
  const date = resolveTalentGtmReportDate(input.targetDate);
  const yesterdayDate = addTalentGtmDateDays(date, -1);
  const weekComparisonDate = addTalentGtmDateDays(date, -7);
  const { excludedLocalIds, jobTouchesByLocalId, records } =
    buildMetricRecords(input);

  const current = countRecords(records, { endDate: date, startDate: date });
  const yesterday = countRecords(records, {
    endDate: yesterdayDate,
    startDate: yesterdayDate,
  });
  const lastWeek = countRecords(records, {
    endDate: weekComparisonDate,
    startDate: weekComparisonDate,
  });
  const channels = TALENT_GTM_CHANNEL_KEYS.map((key) => ({
    current: countRecords(records, {
      channel: key,
      endDate: date,
      startDate: date,
    }),
    key,
    label: CHANNEL_LABELS[key],
    lastWeekUniqueUsers: countRecords(records, {
      channel: key,
      endDate: weekComparisonDate,
      startDate: weekComparisonDate,
    }).uniqueUsers,
    yesterday: countRecords(records, {
      channel: key,
      endDate: yesterdayDate,
      startDate: yesterdayDate,
    }),
  }));

  return {
    channels,
    contentRows: buildContentRows(records, date),
    date,
    generatedAt: new Date().toISOString(),
    jobRows: buildJobRows({
      date,
      excludedLocalIds,
      jobs: input.jobs,
      jobTouchesByLocalId,
      records,
    }),
    otherSourceRows: buildOtherSourceRows(records, date),
    overall: { current, lastWeek, yesterday },
    weekComparisonDate,
    yesterdayDate,
  };
}

export async function buildTalentGtmReport(
  args: {
    date?: string | null;
    excludedEmails?: string[];
  } = {}
) {
  const { supabaseServer } = await import("@/lib/supabaseServer");
  const targetDate = resolveTalentGtmReportDate(args.date);
  const analysisStartDate = addTalentGtmDateDays(targetDate, -7);
  const analysisRange = getKstRange(analysisStartDate, 8);
  const reportEndRange = getKstRange(targetDate, 1);
  const attributionStartDate = addTalentGtmDateDays(
    targetDate,
    -ATTRIBUTION_LOOKBACK_DAYS
  );
  const attributionRange = getKstRange(
    attributionStartDate,
    ATTRIBUTION_LOOKBACK_DAYS + 1
  );

  const [
    entryLogs,
    signupLogs,
    onboardingEvents,
    jobs,
    identityLogs,
    jobEventLogs,
    excludedTalentLogs,
  ] = await Promise.all([
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("created_at,local_id,type")
        .or(
          "type.eq.new_visit,type.like.new_visit:%,type.eq.new_session,type.like.new_session:%"
        )
        .gte("created_at", analysisRange.startIso)
        .lt("created_at", analysisRange.endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<SignupLogRow>((from, to) =>
      supabaseServer
        .from("logs")
        .select("created_at,user_id")
        .eq("type", "career_signup_completed")
        .gte("created_at", analysisRange.startIso)
        .lt("created_at", analysisRange.endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<TalentActivityRow>((from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("created_at,event_type,source,talent_id")
        .eq("event_type", "onboarding_completed")
        .gte("created_at", analysisRange.startIso)
        .lt("created_at", analysisRange.endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<OfficialJobRow>((from, to) =>
      supabaseServer
        .from("official_jobs")
        .select("company_name,is_published,role_title,slug")
        .neq("role_title", OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE)
        .neq("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG)
        .order("display_order", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("created_at,local_id,type")
        .like("type", "login_email:%")
        .gte("created_at", attributionRange.startIso)
        .lt("created_at", reportEndRange.endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("created_at,local_id,type")
        .like("type", "official_jobs:%")
        .gte("created_at", attributionRange.startIso)
        .lt("created_at", reportEndRange.endIso)
        .order("id", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<Pick<SignupLogRow, "user_id">>((from, to) =>
      supabaseServer
        .from("logs")
        .select("user_id")
        .eq("type", ANALYTICS_TEST_FIXTURE_TALENT_LOG_TYPE)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const eventUserIds = new Set(
    [
      ...signupLogs.map((row) => row.user_id),
      ...onboardingEvents.map((row) => row.talent_id),
      ...excludedTalentLogs.map((row) => row.user_id),
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
  const talentUsers = await fetchRowsForValues<TalentUserRow>(
    eventUserIds,
    (ids, from, to) =>
      supabaseServer
        .from("talent_users")
        .select("email,user_id")
        .in("user_id", ids)
        .range(from, to)
  );
  const relevantLocalIds = new Set(
    [...entryLogs, ...identityLogs]
      .map((row) => String(row.local_id ?? "").trim())
      .filter(Boolean)
  );
  const utmLogs = await fetchRowsForValues<LandingLogRow>(
    relevantLocalIds,
    (ids, from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("created_at,local_id,type")
        .in("local_id", ids)
        .like("type", "utm:%")
        .gte("created_at", attributionRange.startIso)
        .lt("created_at", reportEndRange.endIso)
        .order("id", { ascending: true })
        .range(from, to)
  );
  const jobLocalIds = new Set(
    [...entryLogs, ...identityLogs]
      .filter(
        (row) => getLandingLogSource(row.type) === OFFICIAL_JOBS_LANDING_SOURCE
      )
      .map((row) => String(row.local_id ?? "").trim())
      .filter(Boolean)
  );
  const officialJobEvents = await fetchRowsForValues<OfficialJobEventRow>(
    jobLocalIds,
    (ids, from, to) =>
      supabaseServer
        .from("official_job_events")
        .select("anonymous_id,created_at,path,referrer")
        .in("anonymous_id", ids)
        .gte("created_at", attributionRange.startIso)
        .lt("created_at", reportEndRange.endIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to)
  );
  const officialJobIntentEvents = await fetchRowsForValues<TalentActivityRow>(
    eventUserIds,
    (ids, from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("created_at,event_type,source,talent_id")
        .in("talent_id", ids)
        .eq("event_type", "official_jobs_signup_intent")
        .gte("created_at", attributionRange.startIso)
        .lt("created_at", reportEndRange.endIso)
        .order("created_at", { ascending: true })
        .range(from, to)
  );
  const excludedEmails = normalizeExcludedEmails([
    ...DEFAULT_ADMIN_EXCLUDED_EMAILS,
    ...(args.excludedEmails ?? []),
  ]);

  return buildTalentGtmReportFromRows({
    officialJobEvents,
    entryLogs,
    excludedEmails,
    excludedUserIds: new Set(
      excludedTalentLogs
        .map((row) => String(row.user_id ?? "").trim())
        .filter(Boolean)
    ),
    identityLogs,
    jobEventLogs,
    jobs,
    onboardingEvents,
    officialJobIntentEvents,
    signupLogs,
    talentUsers,
    targetDate,
    utmLogs,
  });
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("ko-KR");
}

export function formatTalentGtmCountDelta(current: number, previous: number) {
  if (current === previous) return "→";
  if (previous === 0)
    return current > 0 ? `▲신규 ${formatInteger(current)}` : "→";
  const percent = ((current - previous) / previous) * 100;
  const arrow = percent > 0 ? "▲" : "▼";
  return `${arrow}${Math.abs(percent).toFixed(1)}%`;
}

function rawCell(text: string): SlackRawTextCell {
  return { text, type: "raw_text" };
}

function tableBlock(
  rows: string[][],
  options: { leftAlignedColumns?: number[]; wrappedColumns?: number[] } = {}
): SlackTableBlock {
  const columnCount = rows[0]?.length ?? 0;
  return {
    column_settings: Array.from({ length: columnCount }, (_, index) =>
      index === 0 || options.leftAlignedColumns?.includes(index)
        ? {
            align: "left",
            is_wrapped: index === 0 || options.wrappedColumns?.includes(index),
          }
        : {
            align: "right",
            is_wrapped: options.wrappedColumns?.includes(index),
          }
    ),
    rows: rows.map((row) => row.map(rawCell)),
    type: "table",
  };
}

function metricLine(label: string, current: number, previous: number) {
  return `${label}  *${formatInteger(current)}*  ${formatTalentGtmCountDelta(
    current,
    previous
  )}`;
}

function metricCell(current: number, previous: number) {
  return `${formatInteger(current)} ${formatTalentGtmCountDelta(
    current,
    previous
  )}`;
}

function formatFallbackTable(rows: string[][]) {
  if (rows.length === 0) return "";
  const widths = rows[0].map((_, column) =>
    Math.min(
      42,
      Math.max(...rows.map((row) => String(row[column] ?? "").length))
    )
  );
  return rows
    .map((row) =>
      row
        .map((value, column) =>
          String(value ?? "")
            .slice(0, widths[column])
            .padEnd(widths[column], " ")
        )
        .join("  ")
    )
    .join("\n");
}

function formatChannelRows(report: TalentGtmReport) {
  return [
    ["채널", "방문자", "회원가입", "온보딩 완료", "지난주 방문자 대비"],
    ...report.channels.map((row) => [
      row.label,
      metricCell(row.current.uniqueUsers, row.yesterday.uniqueUsers),
      metricCell(row.current.signups, row.yesterday.signups),
      metricCell(
        row.current.onboardingCompleted,
        row.yesterday.onboardingCompleted
      ),
      formatTalentGtmCountDelta(
        row.current.uniqueUsers,
        row.lastWeekUniqueUsers
      ),
    ]),
  ];
}

function formatJobRows(report: TalentGtmReport) {
  return [
    ["공고", "방문자", "회원가입", "온보딩 완료"],
    ...report.jobRows.map((row) => [
      `${row.companyName} · ${row.roleTitle}`,
      formatInteger(row.uniqueUsers),
      formatInteger(row.signups),
      formatInteger(row.onboardingCompleted),
    ]),
  ];
}

function formatContentRows(report: TalentGtmReport) {
  return [
    ["소스", "매체", "캠페인", "콘텐츠", "방문자", "회원가입", "온보딩 완료"],
    ...report.contentRows.map((row) => [
      row.source,
      row.medium,
      row.campaign,
      row.content,
      formatInteger(row.uniqueUsers),
      formatInteger(row.signups),
      formatInteger(row.onboardingCompleted),
    ]),
  ];
}

function formatOtherSourceLabel(source: string) {
  if (source === "career") return "직접 방문·출처 미확인";
  if (source === "unknown") return "출처 미확인";
  return source;
}

function formatOtherRows(report: TalentGtmReport) {
  return [
    ["유입 경로", "방문자", "회원가입", "온보딩 완료"],
    ...report.otherSourceRows.map((row) => [
      formatOtherSourceLabel(row.source),
      formatInteger(row.uniqueUsers),
      formatInteger(row.signups),
      formatInteger(row.onboardingCompleted),
    ]),
  ];
}

export function formatTalentGtmSlackMessages(
  report: TalentGtmReport,
  options: { insight?: string } = {}
): TalentGtmSlackMessages {
  const insight = options.insight?.trim();
  const current = report.overall.current;
  const yesterday = report.overall.yesterday;
  const lastWeek = report.overall.lastWeek;
  const channelRows = formatChannelRows(report);
  const summary = [
    "*전체*",
    metricLine("방문자", current.uniqueUsers, yesterday.uniqueUsers),
    `지난주 대비 방문자  ${formatTalentGtmCountDelta(
      current.uniqueUsers,
      lastWeek.uniqueUsers
    )}`,
    metricLine("회원가입", current.signups, yesterday.signups),
    metricLine(
      "온보딩 완료",
      current.onboardingCompleted,
      yesterday.onboardingCompleted
    ),
  ].join("\n");
  const mainText = [
    ...(insight ? [insight, ""] : []),
    `Talent GTM · ${report.date}`,
    summary.replace(/\*/g, "").replace(/_/g, ""),
    "",
    formatFallbackTable(channelRows),
  ].join("\n");

  const main: TalentGtmSlackMessage = {
    blocks: [
      ...(insight
        ? [{ text: { text: insight, type: "plain_text" }, type: "section" }]
        : []),
      {
        text: { text: `Talent GTM · ${report.date}`, type: "plain_text" },
        type: "header",
      },
      { text: { text: summary, type: "mrkdwn" }, type: "section" },
      tableBlock(channelRows, {
        leftAlignedColumns: [4],
        wrappedColumns: [4],
      }),
    ],
    text: mainText,
  };

  const jobRows = formatJobRows(report);
  const jobs: TalentGtmSlackMessage = {
    ...(report.jobRows.length > 0
      ? {
          blocks: [
            {
              text: {
                text: `*공고별 유입* · ${report.jobRows.length}개`,
                type: "mrkdwn",
              },
              type: "section",
            },
            tableBlock(jobRows),
          ],
        }
      : {}),
    text:
      report.jobRows.length > 0
        ? `공고별 유입 · ${report.jobRows.length}개\n\`\`\`\n${formatFallbackTable(
            jobRows
          )}\n\`\`\``
        : "공고별 유입 · 표시할 공고가 없습니다.",
  };

  const contentRows = formatContentRows(report);
  const content: TalentGtmSlackMessage = {
    ...(report.contentRows.length > 0
      ? {
          blocks: [
            {
              text: {
                text: "*Instagram·콘텐츠별 유입*",
                type: "mrkdwn",
              },
              type: "section",
            },
            tableBlock(contentRows),
          ],
        }
      : {}),
    text:
      report.contentRows.length > 0
        ? `Instagram·콘텐츠별 유입\n\`\`\`\n${formatFallbackTable(
            contentRows
          )}\n\`\`\``
        : "Instagram·콘텐츠별 유입 · 해당 일자 유입이 없습니다.",
  };

  const otherRows = formatOtherRows(report);
  const notesText = [
    "기타 유입 상세",
    report.otherSourceRows.length > 0
      ? `\`\`\`\n${formatFallbackTable(otherRows)}\n\`\`\``
      : "해당 일자 유입이 없습니다.",
  ].join("\n");
  const notes: TalentGtmSlackMessage = {
    ...(report.otherSourceRows.length > 0
      ? {
          blocks: [
            {
              text: { text: "*기타 유입 상세*", type: "mrkdwn" },
              type: "section",
            },
            tableBlock(otherRows),
          ],
        }
      : {}),
    text: notesText,
  };

  return { content, jobs, main, notes };
}
