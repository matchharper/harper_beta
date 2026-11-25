import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  changeMarkLines,
  OpsChartTooltipBox,
  useOpenChanges,
  useOpsChangeMarks,
} from "@/components/ops/metrics/OpsChartTooltip";
import {
  formatUpdateMetricSample,
  formatUpdateMetricValue,
  updateMetricSeriesColors,
  type UpdateMetricPoint,
} from "@/components/ops/metrics/updateMetricPoints";
import {
  UPDATE_METRICS,
  type OpsChangeChart,
  type UpdateMetricChart,
  type UpdateMetricKey,
  type UpdateMetricUnit,
} from "@/lib/ops/updateMetrics";

// 배포 후 실험중인 지표의 그래프 하나. 막대(건수)는 왼쪽 축, 선(비율·평균)은 오른쪽 축에 그리고, 막대가 없으면 선이
// 왼쪽 축을 쓴다. 변화의 배포일은 점선 세로선이고, 마우스를 올리면 날짜 아래에 무엇을 바꿨는지 보인다(OpsChartTooltip).

function axisFormatter(unit: UpdateMetricUnit) {
  return (value: number) => {
    if (unit === "percent") return `${Math.round(value * 100)}%`;
    if (unit === "usd") return `$${value.toFixed(value < 1 ? 2 : 1)}`;
    if (unit === "minutes") return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}분`;
    return value.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
  };
}

function PointTooltip({
  active,
  chart,
  changeChart,
  colors,
  payload,
}: {
  active?: boolean;
  chart: UpdateMetricChart;
  changeChart: OpsChangeChart;
  colors: Map<UpdateMetricKey, string>;
  payload?: ReadonlyArray<{ payload?: UpdateMetricPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const keys = [...(chart.lines ?? []), ...(chart.bars ?? [])];
  return (
    <OpsChartTooltipBox
      chart={changeChart}
      point={point}
      rows={keys.map((key) => {
        const value = point.values[key];
        const sample = formatUpdateMetricSample(value);
        return {
          color: colors.get(key) ?? "currentColor",
          key,
          label: UPDATE_METRICS[key].label,
          value: `${formatUpdateMetricValue(UPDATE_METRICS[key].unit, value, "chart")}${sample ? ` · ${sample}` : ""}`,
        };
      })}
      title={point.fullLabel}
    />
  );
}

export default function OpsUpdateMetricChart({
  chart,
  changeChart,
  height = 240,
  points,
  showMarkNames = true,
}: {
  chart: UpdateMetricChart;
  /** Which tracked changes this chart marks: "headline" for all, or one change's own chart. */
  changeChart: OpsChangeChart;
  height?: number;
  points: UpdateMetricPoint[];
  /** A change's own chart already has its name above it, so its line needs no name. */
  showMarkNames?: boolean;
}) {
  const marks = useOpsChangeMarks(changeChart, points);
  const openChanges = useOpenChanges();
  const bars = chart.bars ?? [];
  const lines = chart.lines ?? [];
  const colors = updateMetricSeriesColors(chart);
  const leftUnit = UPDATE_METRICS[bars[0] ?? lines[0] ?? "signups"].unit;
  const rightUnit = bars.length > 0 && lines.length > 0 ? UPDATE_METRICS[lines[0]].unit : null;
  const lineAxis = rightUnit ? "right" : "left";
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer height="100%" width="100%">
        <ComposedChart data={points} margin={{ left: 0, right: 6, top: 14 }}>
          <CartesianGrid
            stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
            vertical={false}
          />
          <XAxis
            axisLine={false}
            dataKey="label"
            fontSize={11}
            minTickGap={20}
            tick={{ fill: "var(--color-neutral-soft)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={leftUnit !== "count"}
            axisLine={false}
            domain={[0, "auto"]}
            fontSize={11}
            tick={{ fill: "var(--color-neutral-soft)" }}
            tickFormatter={axisFormatter(leftUnit)}
            tickLine={false}
            width={46}
            yAxisId="left"
          />
          {rightUnit ? (
            <YAxis
              axisLine={false}
              domain={[0, "auto"]}
              fontSize={11}
              orientation="right"
              tick={{ fill: "var(--color-neutral-soft)" }}
              tickFormatter={axisFormatter(rightUnit)}
              tickLine={false}
              width={46}
              yAxisId="right"
            />
          ) : null}
          <Tooltip
            content={<PointTooltip changeChart={changeChart} chart={chart} colors={colors} />}
            cursor={{ fill: "var(--color-neutral-1000-a05)" }}
          />
          {changeMarkLines(marks, openChanges, { label: showMarkNames, yAxisId: "left" })}
          {bars.map((key, index) => (
            <Bar
              dataKey={key}
              fill={colors.get(key)}
              isAnimationActive={false}
              key={key}
              maxBarSize={chart.stackBars ? 28 : 16}
              radius={chart.stackBars && index < bars.length - 1 ? undefined : [2, 2, 0, 0]}
              stackId={chart.stackBars ? "bars" : undefined}
              yAxisId="left"
            />
          ))}
          {lines.map((key) => (
            <Line
              activeDot={{ fill: colors.get(key), r: 4, strokeWidth: 0 }}
              connectNulls
              dataKey={key}
              dot={points.length <= 16 ? { fill: colors.get(key), r: 2, strokeWidth: 0 } : false}
              isAnimationActive={false}
              key={key}
              stroke={colors.get(key)}
              strokeWidth={2}
              type="monotone"
              yAxisId={lineAxis}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
