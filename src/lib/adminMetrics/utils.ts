import {
  ADMIN_METRIC_DEFAULT_GRID_COLS,
  ADMIN_METRIC_MAX_GRID_COLS,
  ADMIN_METRIC_MIN_GRID_COLS,
} from "./constants";
import type {
  AdminMetricAggregatedBucket,
  AdminMetricDailyBucket,
  AdminMetricInterval,
  AdminMetricKey,
} from "./types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

export function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeExcludedEmails(input: string | string[]) {
  const rawValues = Array.isArray(input)
    ? input
    : String(input ?? "").split(/[\n,]/g);

  return Array.from(
    new Set(rawValues.map((value) => normalizeEmail(value)).filter(Boolean))
  );
}

export function getKstTodayDate() {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function toKstDateKey(isoString: string | null | undefined) {
  const value = String(isoString ?? "").trim();
  if (!value) return "";

  const utcMs = new Date(value).getTime();
  if (!Number.isFinite(utcMs)) return "";

  return new Date(utcMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function createEmptyMetricBucket(date: string): AdminMetricDailyBucket {
  return {
    date,
    signupCount: 0,
    runCount: 0,
    revealCount: 0,
    uniqueProfileViewCount: 0,
    markedCandidateCount: 0,
    profileLinkClickCount: 0,
    chatInputCount: 0,
    loginUserCount: 0,
    profileViewUserCount: 0,
    runUserCount: 0,
    uniqueProfileViewKeys: [],
    markedCandidateKeys: [],
    loginUserIds: [],
    profileViewUserIds: [],
    runUserIds: [],
    linkClickedProfileKeys: [],
  };
}

function parseDateKey(value: string): DateParts | null {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  return { year, month, day };
}

function formatDateKey(parts: DateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function shiftDateKey(value: string, amount: number) {
  const parts = parseDateKey(value);
  if (!parts) return value;

  const next = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12, 0, 0, 0)
  );
  return formatDateKey({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  });
}

export function enumerateDateKeys(startDate: string, endDate: string) {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end) return [];

  const startUtc = Date.UTC(start.year, start.month - 1, start.day, 12, 0, 0, 0);
  const endUtc = Date.UTC(end.year, end.month - 1, end.day, 12, 0, 0, 0);
  if (startUtc > endUtc) return [];

  const result: string[] = [];
  for (let current = startUtc; current <= endUtc; current += 24 * 60 * 60 * 1000) {
    const date = new Date(current);
    result.push(
      formatDateKey({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      })
    );
  }

  return result;
}

function getWeekStartDateKey(value: string) {
  const parts = parseDateKey(value);
  if (!parts) return value;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  const weekday = date.getUTCDay();
  const diff = (weekday + 6) % 7;
  return shiftDateKey(value, -diff);
}

function getMonthStartDateKey(value: string) {
  const parts = parseDateKey(value);
  if (!parts) return value;
  return formatDateKey({ year: parts.year, month: parts.month, day: 1 });
}

function formatShortDate(value: string) {
  const parts = parseDateKey(value);
  if (!parts) return value;
  return `${String(parts.month).padStart(2, "0")}.${String(parts.day).padStart(
    2,
    "0"
  )}`;
}

function formatMonthLabel(value: string) {
  const parts = parseDateKey(value);
  if (!parts) return value;
  return `${parts.year}.${String(parts.month).padStart(2, "0")}`;
}

function formatBucketLabel(date: string, interval: AdminMetricInterval) {
  if (interval === "month") {
    return {
      label: formatMonthLabel(date),
      fullLabel: formatMonthLabel(date),
    };
  }

  if (interval === "week") {
    const endDate = shiftDateKey(date, 6);
    return {
      label: formatShortDate(date),
      fullLabel: `${formatShortDate(date)} - ${formatShortDate(endDate)}`,
    };
  }

  return {
    label: formatShortDate(date),
    fullLabel: date,
  };
}

function getAggregateGroupKey(date: string, interval: AdminMetricInterval) {
  if (interval === "week") return getWeekStartDateKey(date);
  if (interval === "month") return getMonthStartDateKey(date);
  return date;
}

function sumMetricBucket(
  current: AdminMetricDailyBucket,
  next: AdminMetricDailyBucket
) {
  const uniqueProfileViewKeys = new Set(current.uniqueProfileViewKeys);
  for (const value of next.uniqueProfileViewKeys) {
    if (value) uniqueProfileViewKeys.add(value);
  }

  const markedCandidateKeys = new Set(current.markedCandidateKeys);
  for (const value of next.markedCandidateKeys) {
    if (value) markedCandidateKeys.add(value);
  }

  const loginUserIds = new Set(current.loginUserIds);
  for (const value of next.loginUserIds) {
    if (value) loginUserIds.add(value);
  }

  const profileViewUserIds = new Set(current.profileViewUserIds);
  for (const value of next.profileViewUserIds) {
    if (value) profileViewUserIds.add(value);
  }

  const runUserIds = new Set(current.runUserIds);
  for (const value of next.runUserIds) {
    if (value) runUserIds.add(value);
  }

  const linkClickedProfileKeys = new Set(current.linkClickedProfileKeys);
  for (const value of next.linkClickedProfileKeys) {
    if (value) linkClickedProfileKeys.add(value);
  }

  current.signupCount += next.signupCount;
  current.runCount += next.runCount;
  current.revealCount += next.revealCount;
  current.profileLinkClickCount += next.profileLinkClickCount;
  current.chatInputCount += next.chatInputCount;
  current.uniqueProfileViewKeys = Array.from(uniqueProfileViewKeys);
  current.markedCandidateKeys = Array.from(markedCandidateKeys);
  current.loginUserIds = Array.from(loginUserIds);
  current.profileViewUserIds = Array.from(profileViewUserIds);
  current.runUserIds = Array.from(runUserIds);
  current.linkClickedProfileKeys = Array.from(linkClickedProfileKeys);
  current.uniqueProfileViewCount = current.uniqueProfileViewKeys.length;
  current.markedCandidateCount = current.markedCandidateKeys.length;
  current.loginUserCount = current.loginUserIds.length;
  current.profileViewUserCount = current.profileViewUserIds.length;
  current.runUserCount = current.runUserIds.length;
  return current;
}

export function aggregateMetricBuckets(
  buckets: AdminMetricDailyBucket[],
  interval: AdminMetricInterval
): AdminMetricAggregatedBucket[] {
  if (interval === "day") {
    return buckets.map((bucket) => {
      const labels = formatBucketLabel(bucket.date, interval);
      return {
        ...bucket,
        label: labels.label,
        fullLabel: labels.fullLabel,
      };
    });
  }

  const grouped = new Map<string, AdminMetricDailyBucket>();

  for (const bucket of buckets) {
    const groupKey = getAggregateGroupKey(bucket.date, interval);
    const current = grouped.get(groupKey) ?? createEmptyMetricBucket(groupKey);
    grouped.set(groupKey, sumMetricBucket(current, bucket));
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => {
      const labels = formatBucketLabel(date, interval);
      return {
        ...bucket,
        date,
        label: labels.label,
        fullLabel: labels.fullLabel,
      };
    });
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

export function getMetricValue(
  bucket: AdminMetricDailyBucket,
  metricKey: AdminMetricKey
) {
  switch (metricKey) {
    case "signupCount":
      return bucket.signupCount;
    case "runCount":
      return bucket.runCount;
    case "revealCount":
      return bucket.revealCount;
    case "uniqueProfileViewCount":
      return bucket.uniqueProfileViewCount;
    case "markedCandidateCount":
      return bucket.markedCandidateCount;
    case "profileLinkClickCount":
      return bucket.profileLinkClickCount;
    case "chatInputCount":
      return bucket.chatInputCount;
    case "loginUserCount":
      return bucket.loginUserCount;
    case "avgProfileViewsPerUser":
      return safeDivide(
        bucket.uniqueProfileViewCount,
        bucket.profileViewUserCount
      );
    case "avgRunsPerUser":
      return safeDivide(bucket.runCount, bucket.runUserCount);
    case "profileEntryToLinkClickRate":
      return safeDivide(
        bucket.linkClickedProfileKeys.length * 100,
        bucket.uniqueProfileViewCount
      );
    default:
      return 0;
  }
}

export function getMetricRangeValue(
  buckets: AdminMetricDailyBucket[],
  metricKey: AdminMetricKey
) {
  const total = buckets.reduce(
    (acc, bucket) => sumMetricBucket(acc, bucket),
    createEmptyMetricBucket("total")
  );

  return getMetricValue(total, metricKey);
}

export function formatMetricValue(metricKey: AdminMetricKey, value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;

  if (metricKey === "avgProfileViewsPerUser" || metricKey === "avgRunsPerUser") {
    return safeValue.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  if (metricKey === "profileEntryToLinkClickRate") {
    return `${safeValue.toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }

  return Math.round(safeValue).toLocaleString("en-US");
}

export function clampMetricGridCols(value: number) {
  if (!Number.isFinite(value)) return ADMIN_METRIC_DEFAULT_GRID_COLS;
  return Math.max(
    ADMIN_METRIC_MIN_GRID_COLS,
    Math.min(ADMIN_METRIC_MAX_GRID_COLS, Math.round(value))
  );
}
