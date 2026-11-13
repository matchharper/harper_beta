import type { OpsTalentMetricRetentionPoint } from "./talentMetrics";

export const ACTIVITY_WEEKDAYS = [
  { key: "monday", label: "월" },
  { key: "tuesday", label: "화" },
  { key: "wednesday", label: "수" },
  { key: "thursday", label: "목" },
  { key: "friday", label: "금" },
  { key: "saturday", label: "토" },
  { key: "sunday", label: "일" },
] as const;

export type WeeklyActivityChartPoint = OpsTalentMetricRetentionPoint &
  Record<(typeof ACTIVITY_WEEKDAYS)[number]["key"], number | null>;

export function latestObservedWeekday(data: OpsTalentMetricRetentionPoint[]) {
  const counts = data.at(-1)?.weekdayCumulativeActiveTalentCounts ?? [];
  const day = counts.findLastIndex((count) => count !== null);
  return day < 0 ? 6 : day;
}

/** Stack increments, never cumulative totals: a person contributes only once. */
export function weeklyActivityChartPoints(data: OpsTalentMetricRetentionPoint[], throughDay: number): WeeklyActivityChartPoint[] {
  return data.map((point) => ({
    ...point,
    ...Object.fromEntries(ACTIVITY_WEEKDAYS.map(({ key }, index) => {
      const cumulative = point.weekdayCumulativeActiveTalentCounts?.[index];
      const previous = index === 0 ? 0 : point.weekdayCumulativeActiveTalentCounts?.[index - 1];
      return [key, index > throughDay || cumulative == null || previous == null ? null : cumulative - previous];
    })),
  } as WeeklyActivityChartPoint));
}
