export const INTRO_SEARCH_DAYS = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
] as const;

export type IntroSearchDay = (typeof INTRO_SEARCH_DAYS)[number];
export const DEFAULT_INTRO_SEARCH_DAYS: IntroSearchDay[] = ["Mon", "Wed", "Fri"];
export const DEFAULT_INTRO_SEARCH_HOUR = 9;

export function parseIntroSearchDays(value: unknown): IntroSearchDay[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) return null;
  const days = value.filter(
    (day): day is IntroSearchDay =>
      typeof day === "string" && INTRO_SEARCH_DAYS.includes(day as IntroSearchDay)
  );
  if (days.length !== value.length || new Set(days).size !== days.length) return null;
  return INTRO_SEARCH_DAYS.filter((day) => days.includes(day));
}

export function parseIntroSearchHour(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23
    ? value
    : null;
}

const KST_MS = 9 * 60 * 60 * 1000;

/**
 * The next scheduled search for a Role, in KST, from its saved days and hour.
 * Unset days or hour fall back to the worker's defaults (Mon/Wed/Fri, 9);
 * an empty day list means no scheduled search, as in the worker.
 */
export function nextScheduledSearchAt(args: {
  days: unknown;
  hour: unknown;
  now: Date;
}) {
  if (Array.isArray(args.days) && args.days.length === 0) return null;
  const days = parseIntroSearchDays(args.days) ?? DEFAULT_INTRO_SEARCH_DAYS;
  const hour = parseIntroSearchHour(args.hour) ?? DEFAULT_INTRO_SEARCH_HOUR;
  const kstNow = new Date(args.now.getTime() + KST_MS);
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(
      Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() + offset,
        hour
      ) - KST_MS
    );
    // INTRO_SEARCH_DAYS starts on Monday; getUTCDay starts on Sunday.
    const weekday =
      INTRO_SEARCH_DAYS[(new Date(day.getTime() + KST_MS).getUTCDay() + 6) % 7];
    if (
      weekday &&
      days.includes(weekday) &&
      day.getTime() > args.now.getTime()
    ) {
      return day.toISOString();
    }
  }
  return null;
}

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A scheduled time in KST: 「수 오전 9:00」 / 「Wed 9:00 AM」. */
export function formatScheduledSearchTime(
  value: string | null | undefined,
  locale: "ko" | "en"
) {
  const time = Date.parse(String(value ?? ""));
  if (!Number.isFinite(time)) return "";
  const kst = new Date(time + KST_MS);
  const hour = kst.getUTCHours();
  const clock = `${hour % 12 || 12}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  return locale === "en"
    ? `${EN_WEEKDAYS[kst.getUTCDay()]} ${clock} ${hour < 12 ? "AM" : "PM"}`
    : `${KO_WEEKDAYS[kst.getUTCDay()]} ${hour < 12 ? "오전" : "오후"} ${clock}`;
}
