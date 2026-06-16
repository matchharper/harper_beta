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

export function formatKstDateTime(value: Date) {
  return value.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
}

function formatRelativeDayLabel(value: Date, maxRelativeDays: number) {
  const dayDiff = getKstDayDiff(value);
  if (dayDiff < 0) return null;
  if (dayDiff === 0) return "오늘";
  if (dayDiff <= maxRelativeDays) return `${dayDiff}일전`;
  return null;
}

export function formatKstRelativeDateTime(
  value: string | null | undefined,
  options?: { maxRelativeDays?: number }
) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const relativeLabel = formatRelativeDayLabel(
    date,
    options?.maxRelativeDays ?? DEFAULT_RELATIVE_DAY_LIMIT
  );
  return relativeLabel ?? formatKstDateTime(date);
}

export function formatKstRelativeDate(
  value: string | null | undefined,
  options?: { maxRelativeDays?: number }
) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const relativeLabel = formatRelativeDayLabel(
    date,
    options?.maxRelativeDays ?? DEFAULT_RELATIVE_DAY_LIMIT
  );
  return relativeLabel ?? formatKstDateOnly(date);
}
