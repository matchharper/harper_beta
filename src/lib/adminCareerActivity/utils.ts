import {
  ADMIN_CAREER_ACTIVITY_INTERVALS,
  type AdminCareerActivityBucket,
  type AdminCareerActivityEvent,
  type AdminCareerActivityEventKind,
  type AdminCareerActivityInterval,
  type AdminCareerActivityMetricValues,
} from "./types";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const INTERACTION_KINDS = new Set<AdminCareerActivityEventKind>([
  "textChat",
  "voice",
  "email",
  "feedback",
  "positionView",
]);

type DateParts = {
  day: number;
  month: number;
  year: number;
};

type MutableMetricBucket = AdminCareerActivityMetricValues & {
  interactingTalentIds: Set<string>;
  liveDbTalentIds: Set<string>;
  signupTalentIds: Set<string>;
  visitorTalentIds: Set<string>;
};

export const ADMIN_CAREER_ACTIVITY_DEFAULT_START_DATE = "2026-04-01";

export function isAdminCareerActivityInterval(
  value: unknown
): value is AdminCareerActivityInterval {
  return ADMIN_CAREER_ACTIVITY_INTERVALS.includes(
    value as AdminCareerActivityInterval
  );
}

export function normalizeDateOnly(value: unknown) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
}

export function getKstTodayDate() {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function toKstStartIso(dateOnly: string) {
  const parts = parseDateParts(dateOnly);
  if (!parts) return null;
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, -9, 0, 0, 0)
  ).toISOString();
}

export function toKstEndExclusiveIso(dateOnly: string) {
  const parts = parseDateParts(dateOnly);
  if (!parts) return null;
  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + 1, -9, 0, 0, 0)
  ).toISOString();
}

export function toKstDateOnly(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDateParts(value: string): DateParts | null {
  const normalized = normalizeDateOnly(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return { day, month, year };
}

function formatDateParts(parts: DateParts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function shiftDateOnly(value: string, amount: number) {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + amount, 12)
  );
  return formatDateParts({
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  });
}

function getWeekStart(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDateOnly(value, -daysSinceMonday);
}

function getMonthStart(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return value;
  return formatDateParts({ ...parts, day: 1 });
}

function getBucketStart(
  dateOnly: string,
  interval: AdminCareerActivityInterval
) {
  if (interval === "week") return getWeekStart(dateOnly);
  if (interval === "month") return getMonthStart(dateOnly);
  return dateOnly;
}

function getNextBucketStart(
  value: string,
  interval: AdminCareerActivityInterval
) {
  if (interval === "day") return shiftDateOnly(value, 1);
  if (interval === "week") return shiftDateOnly(value, 7);

  const parts = parseDateParts(value);
  if (!parts) return value;
  const date = new Date(Date.UTC(parts.year, parts.month, 1, 12));
  return formatDateParts({
    day: 1,
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  });
}

function formatShortDate(value: string) {
  const parts = parseDateParts(value);
  if (!parts) return value;
  return `${String(parts.month).padStart(2, "0")}.${String(parts.day).padStart(
    2,
    "0"
  )}`;
}

function formatBucketLabel(
  startDate: string,
  endDate: string,
  interval: AdminCareerActivityInterval
) {
  if (interval === "month") return startDate.slice(0, 7).replace("-", ".");
  if (interval === "week") {
    return `${formatShortDate(startDate)}–${formatShortDate(endDate)}`;
  }
  return formatShortDate(startDate);
}

function createMutableBucket(): MutableMetricBucket {
  return {
    activityCount: 0,
    careerVisitorCount: 0,
    emailCount: 0,
    feedbackCount: 0,
    interactingTalentCount: 0,
    interactingTalentIds: new Set<string>(),
    liveDbTalentCount: 0,
    liveDbTalentIds: new Set<string>(),
    positionViewCount: 0,
    signupCount: 0,
    signupTalentIds: new Set<string>(),
    textChatCount: 0,
    visitorTalentIds: new Set<string>(),
    voiceCount: 0,
  };
}

function addEvent(
  bucket: MutableMetricBucket,
  event: AdminCareerActivityEvent
) {
  const userId = String(event.userId ?? "").trim();
  if (!userId) return;

  bucket.liveDbTalentIds.add(userId);
  if (event.kind === "signup") bucket.signupTalentIds.add(userId);
  if (event.kind === "visit") bucket.visitorTalentIds.add(userId);

  if (INTERACTION_KINDS.has(event.kind)) {
    bucket.interactingTalentIds.add(userId);
    bucket.activityCount += 1;
  }

  if (event.kind === "textChat") bucket.textChatCount += 1;
  if (event.kind === "voice") bucket.voiceCount += 1;
  if (event.kind === "email") bucket.emailCount += 1;
  if (event.kind === "feedback") bucket.feedbackCount += 1;
  if (event.kind === "positionView") bucket.positionViewCount += 1;
}

function finalizeMetricValues(
  bucket: MutableMetricBucket
): AdminCareerActivityMetricValues {
  return {
    activityCount: bucket.activityCount,
    careerVisitorCount: bucket.visitorTalentIds.size,
    emailCount: bucket.emailCount,
    feedbackCount: bucket.feedbackCount,
    interactingTalentCount: bucket.interactingTalentIds.size,
    liveDbTalentCount: bucket.liveDbTalentIds.size,
    positionViewCount: bucket.positionViewCount,
    signupCount: bucket.signupTalentIds.size,
    textChatCount: bucket.textChatCount,
    voiceCount: bucket.voiceCount,
  };
}

function enumerateBucketStarts(
  startDate: string,
  endDate: string,
  interval: AdminCareerActivityInterval
) {
  const starts: string[] = [];
  let current = getBucketStart(startDate, interval);
  let guard = 0;
  while (current <= endDate && guard < 10_000) {
    starts.push(current);
    current = getNextBucketStart(current, interval);
    guard += 1;
  }
  return starts;
}

export function aggregateCareerActivityEvents(args: {
  endDate: string;
  events: AdminCareerActivityEvent[];
  interval: AdminCareerActivityInterval;
  startDate: string;
}) {
  const normalizedStartDate = normalizeDateOnly(args.startDate);
  const normalizedEndDate = normalizeDateOnly(args.endDate);
  if (!normalizedStartDate || !normalizedEndDate) {
    throw new Error("Invalid date range");
  }
  if (normalizedStartDate > normalizedEndDate) {
    throw new Error("startDate must be before or equal to endDate");
  }

  const bucketsByStart = new Map<string, MutableMetricBucket>();
  for (const bucketStart of enumerateBucketStarts(
    normalizedStartDate,
    normalizedEndDate,
    args.interval
  )) {
    bucketsByStart.set(bucketStart, createMutableBucket());
  }

  const totals = createMutableBucket();
  for (const event of args.events) {
    const dateOnly = toKstDateOnly(event.occurredAt);
    if (
      !dateOnly ||
      dateOnly < normalizedStartDate ||
      dateOnly > normalizedEndDate
    ) {
      continue;
    }

    const bucketStart = getBucketStart(dateOnly, args.interval);
    const bucket = bucketsByStart.get(bucketStart);
    if (!bucket) continue;
    addEvent(bucket, event);
    addEvent(totals, event);
  }

  const buckets: AdminCareerActivityBucket[] = Array.from(
    bucketsByStart.entries()
  ).map(([bucketStart, bucket]) => {
    const naturalEnd = shiftDateOnly(
      getNextBucketStart(bucketStart, args.interval),
      -1
    );
    const clippedStart =
      bucketStart < normalizedStartDate ? normalizedStartDate : bucketStart;
    const clippedEnd =
      naturalEnd > normalizedEndDate ? normalizedEndDate : naturalEnd;

    return {
      ...finalizeMetricValues(bucket),
      endDate: clippedEnd,
      label: formatBucketLabel(clippedStart, clippedEnd, args.interval),
      startDate: clippedStart,
    };
  });

  return {
    buckets,
    totals: finalizeMetricValues(totals),
  };
}

export function daysBetweenDateOnly(startDate: string, endDate: string) {
  const start = parseDateParts(startDate);
  const end = parseDateParts(endDate);
  if (!start || !end) return 0;
  return Math.floor(
    (Date.UTC(end.year, end.month - 1, end.day, 12) -
      Date.UTC(start.year, start.month - 1, start.day, 12)) /
      DAY_MS
  );
}
