import {
  addDays,
  sumValues,
  updateMetricChartValue,
  updateMetricPeriodValue,
  UPDATE_METRICS,
  type OpsUpdateMetricsResponse,
  type UpdateMetricChart,
  type UpdateMetricKey,
  type UpdateMetricUnit,
  type UpdateMetricValue,
} from "@/lib/ops/updateMetrics";

// 서버가 준 날짜별 값을 화면 단위(일·주)의 점으로 묶는다. 주는 /ops/metrics처럼 월요일에 시작한다.

export type UpdateMetricPoint = {
  [key: string]: unknown;
  endDay: string;
  fullLabel: string;
  label: string;
  startDay: string;
  values: Partial<Record<UpdateMetricKey, UpdateMetricValue | null>>;
};

const BAR_COLORS = [
  "color-mix(in srgb, var(--color-action) 45%, transparent)",
  "var(--color-neutral-1000-a10)",
];
const LINE_COLORS = ["var(--color-primary)", "var(--color-positive)", "var(--color-info)"];

/** Each series' color in a chart: bars light, lines strong, in the order the chart lists them. */
export function updateMetricSeriesColors(chart: UpdateMetricChart) {
  const colors = new Map<UpdateMetricKey, string>();
  (chart.bars ?? []).forEach((key, index) => colors.set(key, BAR_COLORS[index % BAR_COLORS.length]));
  (chart.lines ?? []).forEach((key, index) => colors.set(key, LINE_COLORS[index % LINE_COLORS.length]));
  return colors;
}
const monthDay = (day: string) => `${day.slice(5, 7)}.${day.slice(8, 10)}`;

function mondayOf(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** Points for the chosen range and interval, each with every metric's pooled value and the number it draws. */
export function updateMetricPoints(
  response: OpsUpdateMetricsResponse,
  range: { from: string; to: string },
  interval: "day" | "week"
): UpdateMetricPoint[] {
  const groups = new Map<string, number[]>();
  response.days.forEach((day, index) => {
    if (day < range.from || day > range.to) return;
    const key = interval === "week" ? mondayOf(day) : day;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  const keys = Object.keys(UPDATE_METRICS) as UpdateMetricKey[];
  return [...groups.entries()].map(([start, indexes]) => {
    const values: UpdateMetricPoint["values"] = {};
    const point: UpdateMetricPoint = {
      endDay: response.days[indexes[indexes.length - 1]] ?? start,
      fullLabel:
        interval === "week" ? `${monthDay(start)} - ${monthDay(addDays(start, 6))}` : start,
      label: monthDay(start),
      startDay: response.days[indexes[0]] ?? start,
      values,
    };
    for (const key of keys) {
      const series = response.metrics[key];
      const value = series ? sumValues(indexes.flatMap((index) => (series[index] ? [series[index]] : []))) : null;
      values[key] = value;
      point[key] = updateMetricChartValue(value);
    }
    return point;
  });
}

/** A value as the chart reads it ("chart": counts are totals) or as a period average ("period": counts per day). */
export function formatUpdateMetricValue(
  unit: UpdateMetricUnit,
  value: UpdateMetricValue | null | undefined,
  mode: "chart" | "period"
) {
  const number = mode === "chart" ? updateMetricChartValue(value) : updateMetricPeriodValue(value);
  if (number === null || !Number.isFinite(number)) return "–";
  if (unit === "percent") return `${(number * 100).toFixed(1)}%`;
  if (unit === "usd") return `$${number.toFixed(2)}`;
  if (unit === "minutes") return `${number.toFixed(1)}분`;
  if (mode === "period") return `${number.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}/일`;
  return number.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

/** The people or rows behind a value, for tooltips: "5/40" for a rate, "8명" for an average. */
export function formatUpdateMetricSample(value: UpdateMetricValue | null | undefined) {
  if (!value) return "";
  if (value.kind === "rate") {
    return value.denominator > 0
      ? `${value.numerator.toLocaleString("ko-KR")}/${value.denominator.toLocaleString("ko-KR")}`
      : "";
  }
  if (value.kind === "average") return value.denominator > 0 ? `${value.denominator.toLocaleString("ko-KR")}명` : "";
  return "";
}

/** After minus before, signed, in the metric's unit; and whether that is better. */
export function formatUpdateMetricDelta(
  key: UpdateMetricKey,
  before: UpdateMetricValue | null,
  after: UpdateMetricValue | null
) {
  const definition = UPDATE_METRICS[key];
  const from = updateMetricPeriodValue(before);
  const to = updateMetricPeriodValue(after);
  if (from === null || to === null) return { better: null as boolean | null, text: "" };
  const diff = to - from;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const abs = Math.abs(diff);
  const text =
    definition.unit === "percent"
      ? `${sign}${(abs * 100).toFixed(1)}%p`
      : definition.unit === "usd"
        ? `${sign}$${abs.toFixed(2)}`
        : definition.unit === "minutes"
          ? `${sign}${abs.toFixed(1)}분`
          : from > 0
            ? `${sign}${Math.round((abs / from) * 100)}%`
            : `${sign}${abs.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}`;
  const better =
    diff === 0 || definition.better === null ? null : (diff > 0) === (definition.better === "up");
  return { better, text };
}

