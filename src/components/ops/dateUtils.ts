const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RELATIVE_DAY_LIMIT = 14;

const KST_DATE_PART_FORMATTER = new Intl.DateTimeFormat("en-US", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Seoul",
  year: "numeric",
});

function getKstDateParts(date: Date) {
  const parts = KST_DATE_PART_FORMATTER.formatToParts(date);
  const valueByType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    day: Number(valueByType.get("day")),
    month: Number(valueByType.get("month")),
    year: Number(valueByType.get("year")),
  };
}

function getKstDateOnlyMs(date: Date) {
  const parts = getKstDateParts(date);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function getKstDayDiff(value: Date) {
  return Math.floor(
    (getKstDateOnlyMs(new Date()) - getKstDateOnlyMs(value)) / DAY_IN_MS
  );
}

export function formatKstDateOnly(value: Date) {
  const parts = getKstDateParts(value);
  return [
    String(parts.year),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join(".");
}

export function formatKstDateTime(value: Date, locale: "ko" | "en" = "ko") {
  return value.toLocaleString(locale === "ko" ? "ko-KR" : "en-US", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
}

function formatRelativeDayLabel(
  value: Date,
  maxRelativeDays: number,
  locale: "ko" | "en"
) {
  const dayDiff = getKstDayDiff(value);
  if (dayDiff < 0) return null;
  if (dayDiff === 0) return locale === "ko" ? "오늘" : "Today";
  if (dayDiff <= maxRelativeDays)
    return locale === "ko"
      ? `${dayDiff}일전`
      : `${dayDiff} ${dayDiff === 1 ? "day" : "days"} ago`;
  return null;
}

export function formatKstRelativeDateTime(
  value: string | null | undefined,
  options?: { maxRelativeDays?: number; locale?: "ko" | "en" }
) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const relativeLabel = formatRelativeDayLabel(
    date,
    options?.maxRelativeDays ?? DEFAULT_RELATIVE_DAY_LIMIT,
    options?.locale ?? "ko"
  );
  return relativeLabel ?? formatKstDateTime(date, options?.locale);
}

export function formatKstRelativeDate(
  value: string | null | undefined,
  options?: { maxRelativeDays?: number; locale?: "ko" | "en" }
) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const relativeLabel = formatRelativeDayLabel(
    date,
    options?.maxRelativeDays ?? DEFAULT_RELATIVE_DAY_LIMIT,
    options?.locale ?? "ko"
  );
  return (
    relativeLabel ??
    (options?.locale === "en"
      ? new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "short",
          timeZone: "Asia/Seoul",
          year: "numeric",
        }).format(date)
      : formatKstDateOnly(date))
  );
}

/** Elapsed time for Ops company dates; older dates use the Korean calendar. */
export function formatOpsCompanyDate(
  value: string | number | Date | null | undefined,
  now: number = Date.now()
) {
  if (value == null || value === "") return "-";
  // Daily chart buckets represent midnight in Korea, not UTC.
  const date = new Date(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+09:00`
      : value
  );
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) return "-";
  const elapsed = now - timestamp;
  if (elapsed < 0 || elapsed >= 14 * DAY_IN_MS) return formatKstDateOnly(date);
  if (elapsed < 60_000) return "방금 전";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < DAY_IN_MS) return `${Math.floor(elapsed / 3_600_000)}시간 전`;
  return `${Math.floor(elapsed / DAY_IN_MS)}일 전`;
}
