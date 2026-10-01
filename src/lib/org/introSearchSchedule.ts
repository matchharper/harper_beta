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
