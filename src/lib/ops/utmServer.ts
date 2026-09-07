import { isEmailExcluded } from "@/lib/adminEmailExclusions";
import {
  normalizeEmail,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import { extractEmailFromLandingLoginType } from "@/lib/landingLogTypes";
import {
  CAREER_UTM_DESCRIPTION_MAX_LENGTH,
  normalizeCareerUtmDescription,
  normalizeCareerUtmSource,
} from "@/lib/career/utm";
import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from "@/lib/adminEmailExclusions";
import type {
  OpsUtmAccess,
  OpsUtmChartBucket,
  OpsUtmGranularity,
  OpsUtmPeriod,
  OpsUtmSourceDetail,
  OpsUtmSourcePage,
  OpsUtmSourceRow,
} from "@/lib/ops/utm";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";

const BATCH_SIZE = 1000;
const VALUE_CHUNK_SIZE = 300;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SOURCE_PAGE_SIZE = 30;
const MAX_SOURCE_PAGE_SIZE = 60;
const PERIOD_DAYS: Record<OpsUtmPeriod, number> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "12m": 365,
};

type CareerUtmSourceRow =
  Database["public"]["Tables"]["career_utm_sources"]["Row"];
type LandingLogRow = Pick<
  Database["public"]["Tables"]["landing_logs"]["Row"],
  "created_at" | "local_id" | "type"
>;
type TalentUserRow = Pick<
  Database["public"]["Tables"]["talent_users"]["Row"],
  "email" | "user_id"
>;
type TalentSettingRow = Pick<
  Database["public"]["Tables"]["talent_setting"]["Row"],
  "is_onboarding_done" | "user_id"
>;
type TalentActivityRow = Pick<
  Database["public"]["Tables"]["talent_activity_events"]["Row"],
  "event_type" | "talent_id"
>;

type FetchPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

type SourceStats = {
  entryLocalIds: Set<string>;
  lastEnteredAt: string | null;
};

type KstDateParts = {
  day: number;
  monthIndex: number;
  year: number;
};

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

async function fetchRowsForValues<T>(
  values: Iterable<string>,
  loadPage: (
    values: string[],
    from: number,
    to: number
  ) => PromiseLike<FetchPageResult<T>>
) {
  const normalized = Array.from(
    new Set(
      Array.from(values)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
  const rows: T[] = [];

  for (let index = 0; index < normalized.length; index += VALUE_CHUNK_SIZE) {
    const chunk = normalized.slice(index, index + VALUE_CHUNK_SIZE);
    rows.push(
      ...(await fetchAllRows<T>((from, to) => loadPage(chunk, from, to)))
    );
  }

  return rows;
}

function toKstParts(date: Date): KstDateParts {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    day: kst.getUTCDate(),
    monthIndex: kst.getUTCMonth(),
    year: kst.getUTCFullYear(),
  };
}

function toDateKey(parts: KstDateParts) {
  return `${parts.year}-${String(parts.monthIndex + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateKeyToParts(key: string): KstDateParts {
  const [year, month, day] = key.split("-").map(Number);
  return { day, monthIndex: month - 1, year };
}

function addDateKeyDays(key: string, days: number) {
  const parts = dateKeyToParts(key);
  const date = new Date(
    Date.UTC(parts.year, parts.monthIndex, parts.day + days)
  );
  return toDateKey({
    day: date.getUTCDate(),
    monthIndex: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  });
}

function dateKeyToKstStart(key: string) {
  const parts = dateKeyToParts(key);
  return new Date(
    Date.UTC(parts.year, parts.monthIndex, parts.day) - KST_OFFSET_MS
  );
}

function formatBucketDate(key: string) {
  const { day, monthIndex } = dateKeyToParts(key);
  return `${monthIndex + 1}.${String(day).padStart(2, "0")}`;
}

function getMondayKey(key: string) {
  const parts = dateKeyToParts(key);
  const dayOfWeek = new Date(
    Date.UTC(parts.year, parts.monthIndex, parts.day)
  ).getUTCDay();
  const daysFromMonday = (dayOfWeek + 6) % 7;
  return addDateKeyDays(key, -daysFromMonday);
}

function resolveRange(period: OpsUtmPeriod, now = new Date()) {
  const endDateKey = toDateKey(toKstParts(now));
  const startDateKey = addDateKeyDays(endDateKey, -(PERIOD_DAYS[period] - 1));
  return {
    endAt: now.toISOString(),
    endDateKey,
    startAt: dateKeyToKstStart(startDateKey).toISOString(),
    startDateKey,
  };
}

function getExcludedEmails(extra: string[]) {
  return normalizeExcludedEmails([...DEFAULT_ADMIN_EXCLUDED_EMAILS, ...extra]);
}

function collectExcludedLocalIds(
  loginLogs: LandingLogRow[],
  excludedEmails: string[]
) {
  const result = new Set<string>();
  for (const log of loginLogs) {
    const localId = String(log.local_id ?? "").trim();
    const email = normalizeEmail(extractEmailFromLandingLoginType(log.type));
    if (localId && email && isEmailExcluded(email, excludedEmails)) {
      result.add(localId);
    }
  }
  return result;
}

function toSourceRow(
  source: string,
  registered: CareerUtmSourceRow | undefined,
  stats: SourceStats | undefined
): OpsUtmSourceRow {
  return {
    createdAt: registered?.created_at ?? null,
    description: registered?.description ?? null,
    entryCount: stats?.entryLocalIds.size ?? 0,
    id: registered?.id ?? null,
    isRegistered: Boolean(registered),
    lastEnteredAt: stats?.lastEnteredAt ?? null,
    source,
    updatedAt: registered?.updated_at ?? null,
  };
}

async function fetchRegisteredSources() {
  return fetchAllRows<CareerUtmSourceRow>((from, to) =>
    supabaseServer
      .from("career_utm_sources")
      .select("id,source,description,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(from, to)
  );
}

function getUtmSourceFromLogType(type: string | null | undefined) {
  const value = String(type ?? "").trim();
  if (!value.startsWith("utm:")) return null;
  return normalizeCareerUtmSource(
    new URLSearchParams(value.slice("utm:".length)).get("utm_source")
  );
}

function buildObservedSourceStats(
  utmLogs: LandingLogRow[],
  excludedLocalIds: Set<string>
) {
  const result = new Map<string, SourceStats>();

  for (const log of utmLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;
    const source = getUtmSourceFromLogType(log.type);
    if (!source) continue;

    const stats = result.get(source) ?? {
      entryLocalIds: new Set<string>(),
      lastEnteredAt: null,
    };
    stats.entryLocalIds.add(localId);
    if (
      !stats.lastEnteredAt ||
      new Date(log.created_at).getTime() >
        new Date(stats.lastEnteredAt).getTime()
    ) {
      stats.lastEnteredAt = log.created_at;
    }
    result.set(source, stats);
  }

  return result;
}

export async function fetchOpsUtmSources(args: {
  access: OpsUtmAccess;
  limit?: number;
  offset?: number;
  query?: string | null;
}): Promise<OpsUtmSourcePage> {
  const limit = Math.min(
    Math.max(Math.floor(args.limit ?? SOURCE_PAGE_SIZE), 1),
    MAX_SOURCE_PAGE_SIZE
  );
  const offset = Math.max(Math.floor(args.offset ?? 0), 0);
  const [registeredRows, utmLogs] = await Promise.all([
    fetchRegisteredSources(),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at")
        .like("type", "utm:%")
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);

  const statsBySource = buildObservedSourceStats(utmLogs, new Set());
  const registeredBySource = new Map(
    registeredRows.map((row) => [row.source, row] as const)
  );
  const sources = new Set([
    ...registeredRows.map((row) => row.source),
    ...statsBySource.keys(),
  ]);
  const normalizedQuery = String(args.query ?? "")
    .trim()
    .toLowerCase();
  const rows = Array.from(sources)
    .filter((source) =>
      normalizedQuery
        ? source.includes(normalizedQuery) ||
          (registeredBySource.get(source)?.description ?? "")
            .toLowerCase()
            .includes(normalizedQuery)
        : true
    )
    .map((source) =>
      toSourceRow(
        source,
        registeredBySource.get(source),
        statsBySource.get(source)
      )
    )
    .sort((left, right) => {
      const lastEntryDiff =
        new Date(right.lastEnteredAt ?? 0).getTime() -
        new Date(left.lastEnteredAt ?? 0).getTime();
      if (lastEntryDiff !== 0) return lastEntryDiff;
      const createdDiff =
        new Date(right.createdAt ?? 0).getTime() -
        new Date(left.createdAt ?? 0).getTime();
      return createdDiff || left.source.localeCompare(right.source);
    });
  const pageRows = rows.slice(offset, offset + limit);
  const nextOffset = offset + pageRows.length;

  return {
    access: args.access,
    generatedAt: new Date().toISOString(),
    nextOffset: nextOffset < rows.length ? nextOffset : null,
    rows: pageRows,
    total: rows.length,
  };
}

function createEmptyBuckets(
  startDateKey: string,
  endDateKey: string,
  granularity: OpsUtmGranularity
) {
  const buckets = new Map<
    string,
    OpsUtmChartBucket & {
      landingLocalIds: Set<string>;
      onboardingUserIds: Set<string>;
      signupUserIds: Set<string>;
    }
  >();
  let dateKey = startDateKey;

  while (dateKey <= endDateKey) {
    const bucketKey = granularity === "week" ? getMondayKey(dateKey) : dateKey;
    if (!buckets.has(bucketKey)) {
      const label =
        granularity === "week"
          ? `${formatBucketDate(bucketKey)}–${formatBucketDate(addDateKeyDays(bucketKey, 6))}`
          : formatBucketDate(bucketKey);
      buckets.set(bucketKey, {
        key: bucketKey,
        label,
        landing: 0,
        landingLocalIds: new Set(),
        onboardingCompleted: 0,
        onboardingUserIds: new Set(),
        signup: 0,
        signupUserIds: new Set(),
      });
    }
    dateKey = addDateKeyDays(dateKey, 1);
  }

  return buckets;
}

export async function fetchOpsUtmSourceDetail(args: {
  access: OpsUtmAccess;
  excludedEmails?: string[];
  granularity: OpsUtmGranularity;
  period: OpsUtmPeriod;
  source: string;
}): Promise<OpsUtmSourceDetail> {
  const source = normalizeCareerUtmSource(args.source);
  if (!source) throw new Error("유효한 UTM source가 필요합니다.");
  const range = resolveRange(args.period);
  const excludedEmails = getExcludedEmails(args.excludedEmails ?? []);

  const [registeredRows, entryLogs] = await Promise.all([
    fetchRegisteredSources(),
    fetchAllRows<LandingLogRow>((from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at")
        .in("type", [`new_visit:${source}`, `new_session:${source}`])
        .gte("created_at", range.startAt)
        .lte("created_at", range.endAt)
        .order("id", { ascending: true })
        .range(from, to)
    ),
  ]);
  const entryLocalIds = new Set(
    entryLogs.map((log) => String(log.local_id ?? "").trim()).filter(Boolean)
  );
  const loginLogs = await fetchRowsForValues<LandingLogRow>(
    entryLocalIds,
    (localIds, from, to) =>
      supabaseServer
        .from("landing_logs")
        .select("local_id,type,created_at")
        .in("local_id", localIds)
        .like("type", `login_email:%:${source}`)
        .order("id", { ascending: true })
        .range(from, to)
  );
  const excludedLocalIds = collectExcludedLocalIds(loginLogs, excludedEmails);
  const firstEntryByLocalId = new Map<string, LandingLogRow>();

  for (const log of entryLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || excludedLocalIds.has(localId)) continue;
    const existing = firstEntryByLocalId.get(localId);
    if (
      !existing ||
      new Date(log.created_at).getTime() <
        new Date(existing.created_at).getTime()
    ) {
      firstEntryByLocalId.set(localId, log);
    }
  }

  const emailsByLocalId = new Map<string, Set<string>>();
  for (const log of loginLogs) {
    const localId = String(log.local_id ?? "").trim();
    if (!localId || !firstEntryByLocalId.has(localId)) continue;
    const email = normalizeEmail(extractEmailFromLandingLoginType(log.type));
    if (!email || isEmailExcluded(email, excludedEmails)) continue;
    const emails = emailsByLocalId.get(localId) ?? new Set<string>();
    emails.add(email);
    emailsByLocalId.set(localId, emails);
  }

  const emails = new Set(
    Array.from(emailsByLocalId.values()).flatMap((values) => Array.from(values))
  );
  const talentUsers = await fetchRowsForValues<TalentUserRow>(
    emails,
    (emailChunk, from, to) =>
      supabaseServer
        .from("talent_users")
        .select("user_id,email")
        .in("email", emailChunk)
        .order("created_at", { ascending: false })
        .range(from, to)
  );
  const userIdByEmail = new Map<string, string>();
  for (const user of talentUsers) {
    const email = normalizeEmail(user.email);
    if (email && !userIdByEmail.has(email)) {
      userIdByEmail.set(email, user.user_id);
    }
  }
  const userIds = new Set(userIdByEmail.values());
  const [talentSettings, activityRows] = await Promise.all([
    fetchRowsForValues<TalentSettingRow>(userIds, (ids, from, to) =>
      supabaseServer
        .from("talent_setting")
        .select("user_id,is_onboarding_done")
        .in("user_id", ids)
        .range(from, to)
    ),
    fetchRowsForValues<TalentActivityRow>(userIds, (ids, from, to) =>
      supabaseServer
        .from("talent_activity_events")
        .select("talent_id,event_type")
        .in("talent_id", ids)
        .eq("event_type", "onboarding_completed")
        .range(from, to)
    ),
  ]);
  const onboardedUserIds = new Set<string>();
  for (const setting of talentSettings) {
    if (setting.is_onboarding_done) onboardedUserIds.add(setting.user_id);
  }
  for (const activity of activityRows) {
    if (activity.event_type === "onboarding_completed") {
      onboardedUserIds.add(activity.talent_id);
    }
  }

  const buckets = createEmptyBuckets(
    range.startDateKey,
    range.endDateKey,
    args.granularity
  );
  const allLandingLocalIds = new Set<string>();
  const allSignupUserIds = new Set<string>();
  const allOnboardingUserIds = new Set<string>();

  for (const [localId, entry] of firstEntryByLocalId) {
    const dateKey = toDateKey(toKstParts(new Date(entry.created_at)));
    const bucketKey =
      args.granularity === "week" ? getMondayKey(dateKey) : dateKey;
    const bucket = buckets.get(bucketKey);
    if (!bucket) continue;
    bucket.landingLocalIds.add(localId);
    allLandingLocalIds.add(localId);

    const userId = Array.from(emailsByLocalId.get(localId) ?? [])
      .map((email) => userIdByEmail.get(email))
      .find((value): value is string => Boolean(value));
    if (userId) {
      bucket.signupUserIds.add(userId);
      allSignupUserIds.add(userId);
      if (onboardedUserIds.has(userId)) {
        bucket.onboardingUserIds.add(userId);
        allOnboardingUserIds.add(userId);
      }
    }
  }

  const chartBuckets = Array.from(buckets.values()).map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    landing: bucket.landingLocalIds.size,
    onboardingCompleted: bucket.onboardingUserIds.size,
    signup: bucket.signupUserIds.size,
  }));
  const landingCount = allLandingLocalIds.size;
  const registeredBySource = new Map(
    registeredRows.map((row) => [row.source, row] as const)
  );
  const registered = registeredBySource.get(source);
  const lastEnteredAt = entryLogs.reduce<string | null>((latest, row) => {
    if (!latest) return row.created_at;
    return new Date(row.created_at).getTime() > new Date(latest).getTime()
      ? row.created_at
      : latest;
  }, null);
  const metric = (count: number) => ({
    count,
    rateFromLanding: landingCount > 0 ? count / landingCount : null,
  });

  return {
    access: args.access,
    buckets: chartBuckets,
    generatedAt: new Date().toISOString(),
    granularity: args.granularity,
    period: args.period,
    range: { endAt: range.endAt, startAt: range.startAt },
    source: toSourceRow(source, registered, {
      entryLocalIds: allLandingLocalIds,
      lastEnteredAt,
    }),
    totals: {
      landing: metric(landingCount),
      onboardingCompleted: metric(allOnboardingUserIds.size),
      signup: metric(allSignupUserIds.size),
    },
  };
}

export function parseOpsUtmSourceMutation(payload: unknown) {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const source = normalizeCareerUtmSource(record.source);
  const description = normalizeCareerUtmDescription(record.description);
  if (!source) {
    throw new Error(
      "source는 영문 소문자, 숫자, 하이픈, 언더스코어 1–80자로 입력해 주세요."
    );
  }
  if (description.length > CAREER_UTM_DESCRIPTION_MAX_LENGTH) {
    throw new Error("description은 500자 이내로 입력해 주세요.");
  }
  return {
    description: description || null,
    id: String(record.id ?? "").trim(),
    source,
  };
}

export function toOpsUtmRegisteredSourceRow(row: CareerUtmSourceRow) {
  return toSourceRow(row.source, row, undefined);
}
