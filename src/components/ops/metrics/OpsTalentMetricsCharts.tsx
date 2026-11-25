import { Hourglass, Info } from "lucide-react";
import { useState } from "react";
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
import { MuteButton } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltips } from "@/components/ui/tooltip";
import {
  changeMarkLines,
  OpsChartTooltipBox,
  OpsSeriesTooltip,
  useOpenChanges,
  useOpsChangeMarks,
} from "@/components/ops/metrics/OpsChartTooltip";
import type { OpsTalentChartKey } from "@/lib/ops/updateMetrics";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_WEEKDAYS, latestObservedWeekday, weeklyActivityChartPoints, type WeeklyActivityChartPoint } from "@/lib/ops/talentMetricsPresentation";
import type {
  OpsTalentMetricDailyActivityPoint,
  OpsTalentMetricConversionTrendPoint,
  OpsTalentMetricEngagementTrendPoint,
  OpsTalentMetricRetentionPoint,
  OpsTalentMetricWeeklyRetentionCohort,
} from "@/lib/ops/talentMetrics";
import {
  OVERVIEW_CHANNELS,
  type OpsTalentMetricOverviewTrendPoint,
} from "@/lib/ops/talentMetricsOverview";

type TrendPoint =
  | OpsTalentMetricConversionTrendPoint
  | OpsTalentMetricEngagementTrendPoint
  | OpsTalentMetricOverviewTrendPoint;

type ChartSeries = {
  axis?: "left" | "right";
  color: string;
  formatter?: (value: number) => string;
  key:
    | keyof OpsTalentMetricConversionTrendPoint
    | keyof OpsTalentMetricEngagementTrendPoint
    | keyof OpsTalentMetricOverviewTrendPoint;
  label: string;
  legendLabel?: string;
  /** Bars with the same stack id are stacked. */
  stack?: string;
  type: "bar" | "line";
};

const RECOMMENDATION_COUNT_DISPLAY_DIVISOR = 5;

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDecimal(value: number) {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function formatAcceptRejectRatio(value: number) {
  return `${value.toLocaleString("ko-KR", {
    maximumFractionDigits: 2,
  })} : 1`;
}

function ChartTitle({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <h2 className="text-sm font-semibold text-neutral-primary">{title}</h2>
      <Tooltips side="top" text={description}>
        <MuteButton
          aria-label={`${title} 설명`}
          className="-my-1"
          size="sm"
          variant="transparent"
        >
          <Info className="h-3 w-3" aria-hidden />
        </MuteButton>
      </Tooltips>
    </div>
  );
}

function MetricChart({
  changeChart,
  data,
  description,
  leftAxisFormatter,
  percentAxis = false,
  rightAxisFormatter = formatDecimal,
  series,
  title,
}: {
  /** Which tracked changes this chart marks (OpsChartTooltip). */
  changeChart: OpsTalentChartKey;
  data: TrendPoint[];
  description: string;
  leftAxisFormatter?: (value: number) => string;
  percentAxis?: boolean;
  rightAxisFormatter?: (value: number) => string;
  series: ChartSeries[];
  title: string;
}) {
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const hasRightAxis = series.some((item) => item.axis === "right");
  const marks = useOpsChangeMarks(changeChart, data);
  const openChanges = useOpenChanges();
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="flex min-h-8 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ChartTitle description={description} title={title} />
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {series.map((item) => (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted"
              key={item.key}
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.legendLabel ?? item.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 6, top: 8 }}>
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
              axisLine={false}
              domain={percentAxis ? [0, 1] : [0, "auto"]}
              fontSize={11}
              tick={{ fill: "var(--color-neutral-soft)" }}
              tickFormatter={
                leftAxisFormatter ?? (percentAxis ? formatPercent : formatDecimal)
              }
              tickLine={false}
              width={42}
              yAxisId="left"
            />
            {hasRightAxis ? (
              <YAxis
                axisLine={false}
                fontSize={11}
                orientation="right"
                tick={{ fill: "var(--color-neutral-soft)" }}
                tickFormatter={rightAxisFormatter}
                tickLine={false}
                width={46}
                yAxisId="right"
              />
            ) : null}
            {changeMarkLines(marks, openChanges, { yAxisId: "left" })}
            <Tooltip
              content={
                <OpsSeriesTooltip
                  chart={changeChart}
                  describe={(key, value) => {
                    const definition = seriesByKey.get(key as ChartSeries["key"]);
                    return {
                      color: definition?.color,
                      label: definition?.label ?? key,
                      value: definition?.formatter?.(value) ?? formatDecimal(value),
                    };
                  }}
                />
              }
            />
            {series.map((item) =>
              item.type === "bar" ? (
                <Bar
                  dataKey={item.key}
                  fill={item.color}
                  key={item.key}
                  maxBarSize={24}
                  radius={item.stack ? undefined : [2, 2, 0, 0]}
                  stackId={item.stack}
                  yAxisId={item.axis ?? "left"}
                />
              ) : (
                <Line
                  activeDot={{ fill: item.color, r: 4, strokeWidth: 0 }}
                  connectNulls={false}
                  dataKey={item.key}
                  dot={{ fill: item.color, r: 2, strokeWidth: 0 }}
                  key={item.key}
                  stroke={item.color}
                  strokeWidth={2}
                  type="monotone"
                  yAxisId={item.axis ?? "left"}
                />
              )
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const TREND_KEY = "activeTalentCount7dAvg";
// Same token as the legend swatch (bg-primary).
const TREND_COLOR = "var(--color-primary)";

/** The 7-day average arrives with the DB function from 20261116020000; older responses draw bars only. */
function hasTrendValues(
  data: Array<OpsTalentMetricDailyActivityPoint | OpsTalentMetricRetentionPoint>
) {
  return data.some(
    (point) => TREND_KEY in point && typeof point[TREND_KEY] === "number"
  );
}

function ActivityChart({
  changeChart,
  color,
  data,
  description,
  metricKey,
  percent = false,
  title,
  trendLabel,
  type,
}: {
  changeChart: OpsTalentChartKey;
  color: string;
  data: Array<
    OpsTalentMetricDailyActivityPoint | OpsTalentMetricRetentionPoint
  >;
  description: string;
  metricKey: "activeTalentCount" | "retentionRate";
  percent?: boolean;
  title: string;
  /** DAU only: draws the 7-day average as a line over lighter bars. */
  trendLabel?: string;
  type: "bar" | "line";
}) {
  const showTrend = Boolean(trendLabel) && type === "bar" && hasTrendValues(data);
  const marks = useOpsChangeMarks(changeChart, data);
  const openChanges = useOpenChanges();
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="flex min-h-8 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ChartTitle description={description} title={title} />
        {showTrend ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              {title}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted">
              <span aria-hidden className="h-0.5 w-3 rounded-full bg-primary" />
              {trendLabel}
            </span>
          </div>
        ) : null}
      </div>
      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 6, top: 8 }}>
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
              axisLine={false}
              domain={percent ? [0, 1] : [0, "auto"]}
              fontSize={11}
              tick={{ fill: "var(--color-neutral-soft)" }}
              tickFormatter={percent ? formatPercent : formatDecimal}
              tickLine={false}
              width={42}
            />
            {changeMarkLines(marks, openChanges)}
            <Tooltip
              content={
                <OpsSeriesTooltip
                  chart={changeChart}
                  describe={(key, value) =>
                    key === TREND_KEY
                      ? {
                          color: TREND_COLOR,
                          label: trendLabel ?? "",
                          value: Math.round(value).toLocaleString("ko-KR"),
                        }
                      : {
                          color,
                          label: title,
                          value: percent ? formatPercent(value) : value.toLocaleString("ko-KR"),
                        }
                  }
                />
              }
            />
            {type === "bar" ? (
              <Bar
                dataKey={metricKey}
                fill={color}
                fillOpacity={showTrend ? 0.35 : 1}
                maxBarSize={24}
                radius={[2, 2, 0, 0]}
              />
            ) : (
              <Line
                activeDot={{ fill: color, r: 4, strokeWidth: 0 }}
                connectNulls={false}
                dataKey={metricKey}
                dot={{ fill: color, r: 2, strokeWidth: 0 }}
                stroke={color}
                strokeWidth={2}
                type="monotone"
              />
            )}
            {showTrend ? (
              <Line
                activeDot={{ fill: TREND_COLOR, r: 3, strokeWidth: 0 }}
                connectNulls={false}
                dataKey={TREND_KEY}
                dot={false}
                isAnimationActive={false}
                stroke={TREND_COLOR}
                strokeWidth={2}
                type="monotone"
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

const WEEKDAY_COLORS = [
  "var(--color-blue-700)",
  "var(--color-action)",
  "var(--color-positive)",
  "var(--color-info)",
  "var(--color-primary)",
  "var(--color-critical)",
  "var(--color-neutral-600)",
];

function WeeklyActivityTooltip({
  active, payload, throughDay,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: WeeklyActivityChartPoint }>;
  throughDay: number;
}) {
  const point = payload?.[0]?.payload;
  const counts = point?.weekdayCumulativeActiveTalentCounts;
  if (!active || !point || !counts) return null;
  return (
    <OpsChartTooltipBox
      chart="wau"
      point={point}
      rows={ACTIVITY_WEEKDAYS.slice(0, throughDay + 1).map((day, index) => ({
        color: WEEKDAY_COLORS[index],
        key: day.key,
        label: `${day.label}요일까지`,
        value: counts[index] == null ? "집계 전" : `${counts[index].toLocaleString("ko-KR")}명`,
      }))}
      title={point.fullLabel}
    />
  );
}

function WeeklyActivityChart({ data }: { data: OpsTalentMetricRetentionPoint[] }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const marks = useOpsChangeMarks("wau", data);
  const openChanges = useOpenChanges();
  // Existing RPCs and cached responses contain only the whole-week total.
  // Keep that total readable until weekday counts are available for every week.
  if (data.some((point) => point.weekdayCumulativeActiveTalentCounts == null)) {
    return (
      <ActivityChart
        changeChart="wau"
        color="var(--color-action)"
        data={data}
        description="월요일부터 일요일까지 각 주에 한 번 이상 활동한 고유 인원입니다. 진행 중인 주는 현재까지 집계합니다. 요일별 데이터가 아직 없어 주별 전체 값을 표시합니다."
        metricKey="activeTalentCount"
        title="WAU"
        type="bar"
      />
    );
  }
  const throughDay = selectedDay ?? latestObservedWeekday(data);
  const points = weeklyActivityChartPoints(data, throughDay);
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="flex min-h-8 items-start justify-between gap-3">
        <ChartTitle title="WAU" description="KST 월요일부터 선택한 요일까지 한 번 이상 활동한 고유 인원입니다. 각 색은 그 주에 처음 활동한 요일의 인원이며, 색의 윗선은 해당 요일까지의 누적 AU입니다. 모든 주에 같은 요일 기준을 적용하며 진행 중인 날은 현재까지 집계합니다." />
        <Select value={String(throughDay)} onValueChange={(value) => setSelectedDay(value === null ? null : Number(value))}>
          <SelectTrigger aria-label="WAU 비교 요일" className="w-auto" size="sm">
            <SelectValue>{ACTIVITY_WEEKDAYS[throughDay].label}요일까지</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACTIVITY_WEEKDAYS.map((day, index) => (
              <SelectItem key={day.key} value={String(index)}>{day.label}요일까지</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {ACTIVITY_WEEKDAYS.map((day, index) => (
          <span key={day.key} className={`inline-flex items-center gap-1.5 text-[11px] text-neutral-muted ${index > throughDay ? "opacity-40" : ""}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: WEEKDAY_COLORS[index] }} />
            {day.label}
          </span>
        ))}
      </div>
      <div className="mt-3 h-[260px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={points} margin={{ left: 0, right: 6, top: 8 }}>
            <CartesianGrid stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)" vertical={false} />
            <XAxis axisLine={false} dataKey="label" fontSize={11} minTickGap={20} tick={{ fill: "var(--color-neutral-soft)" }} tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} domain={[0, "auto"]} fontSize={11} tick={{ fill: "var(--color-neutral-soft)" }} tickLine={false} width={42} />
            {changeMarkLines(marks, openChanges)}
            <Tooltip content={<WeeklyActivityTooltip throughDay={throughDay} />} />
            {ACTIVITY_WEEKDAYS.slice(0, throughDay + 1).map((day, index) => (
              <Bar key={day.key} dataKey={day.key} fill={WEEKDAY_COLORS[index]} maxBarSize={32} stackId="weekly-active" isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function OpsTalentMetricsRetentionTable({
  cohorts,
}: {
  cohorts: OpsTalentMetricWeeklyRetentionCohort[];
}) {
  const maxWeekIndex = cohorts.reduce(
    (maximum, cohort) =>
      Math.max(maximum, ...cohort.weeks.map((cell) => cell.weekIndex)),
    -1
  );
  const weekIndexes = Array.from(
    { length: maxWeekIndex + 1 },
    (_, index) => index
  );

  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:col-span-2">
      <ChartTitle
        description="가입 주차별 cohort에서 각 주차에 한 번 이상 활동한 talent 비율입니다. W0는 가입한 주, W1은 그다음 주입니다. 시계 아이콘은 아직 끝나지 않은 주차의 중간 집계를 뜻합니다."
        title="주간 리텐션"
      />
      {cohorts.length === 0 ? (
        <div className="mt-4 flex h-28 items-center justify-center rounded-md bg-bg-weak text-sm text-neutral-muted">
          선택 기간에 가입 cohort가 없습니다.
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-neutral-1000-a05">
          <Table className="min-w-max border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 min-w-40 border-r border-neutral-1000-a05 bg-bg-floating px-4 py-3 text-neutral-primary">
                  가입 cohort
                </TableHead>
                {weekIndexes.map((weekIndex) => (
                  <TableHead
                    className="min-w-24 border-r border-neutral-1000-a05 px-4 py-3 text-neutral-primary last:border-r-0"
                    key={weekIndex}
                  >
                    W{weekIndex}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cohorts.map((cohort) => {
                const cellsByWeek = new Map(
                  cohort.weeks.map((cell) => [cell.weekIndex, cell])
                );
                return (
                  <TableRow
                    className="hover:bg-transparent"
                    key={cohort.cohortStart}
                  >
                    <TableCell className="sticky left-0 z-10 border-r border-neutral-1000-a05 bg-bg-floating px-4 py-3 font-medium text-neutral-primary">
                      {cohort.label}
                      <span className="ml-1 text-neutral-soft">
                        ({cohort.signupCount.toLocaleString("ko-KR")})
                      </span>
                    </TableCell>
                    {weekIndexes.map((weekIndex) => {
                      const cell = cellsByWeek.get(weekIndex);
                      if (!cell) {
                        return (
                          <TableCell
                            className="border-r border-neutral-1000-a05 px-4 py-3 last:border-r-0"
                            key={weekIndex}
                          />
                        );
                      }
                      const backgroundStrength = Math.round(
                        Math.max(
                          4,
                          Math.min(24, (cell.retentionRate ?? 0) * 28)
                        )
                      );
                      const cellDetail = `${cell.activeTalentCount.toLocaleString("ko-KR")} / ${cohort.signupCount.toLocaleString("ko-KR")}명${cell.isComplete ? "" : " · 진행 중인 주"}`;
                      return (
                        <TableCell
                          className="border-r border-neutral-1000-a05 px-4 py-3 last:border-r-0"
                          key={weekIndex}
                          style={{
                            backgroundColor: `color-mix(in srgb, var(--color-positive) ${backgroundStrength}%, transparent)`,
                          }}
                        >
                          <Tooltips side="top" text={cellDetail}>
                            <span className="inline-flex cursor-help items-center gap-1.5 font-medium tabular-nums text-neutral-primary">
                              {cell.retentionRate === null
                                ? "-"
                                : formatPercent(cell.retentionRate)}
                              {!cell.isComplete ? (
                                <Hourglass
                                  className="h-3 w-3 text-neutral-soft"
                                  aria-label="진행 중"
                                />
                              ) : null}
                            </span>
                          </Tooltips>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

export function OpsTalentMetricsConversionCharts({
  trend,
}: {
  trend: OpsTalentMetricConversionTrendPoint[];
}) {
  return (
    <div className="grid lg:grid-cols-2 lg:gap-x-8">
      <MetricChart
        data={trend.map((point) => ({
          ...point,
          recommendationCount: point.recommendationCount / RECOMMENDATION_COUNT_DISPLAY_DIVISOR,
        }))}
        description="추천 공고 수는 미응답을 포함하며 후보자별로 집계합니다. 그래프에서는 추천 공고 수만 5로 나누고 툴팁에는 실제 건수를 표시합니다. 수락·거절은 결정 시점 기준입니다. 피드백 참여자는 해당 기간에 수락 또는 거절을 하나 이상 남긴 고유 인원으로, 여러 공고에 응답해도 한 명입니다. 오른쪽 축은 거절 1건당 수락 건수이며, 거절이 0건이면 비율선을 표시하지 않습니다."
        rightAxisFormatter={formatAcceptRejectRatio}
        series={[
          {
            color: "var(--color-positive)",
            key: "recommendationAcceptedCount",
            label: "수락",
            type: "bar",
          },
          {
            color: "var(--color-critical)",
            key: "recommendationRejectedCount",
            label: "거절",
            type: "bar",
          },
          {
            color: "var(--color-neutral-600)",
            formatter: (value) => `${(value * RECOMMENDATION_COUNT_DISPLAY_DIVISOR).toLocaleString("ko-KR")}건`,
            key: "recommendationCount",
            label: "전체 추천 공고 수",
            legendLabel: `전체 추천 공고 수 ÷${RECOMMENDATION_COUNT_DISPLAY_DIVISOR}`,
            type: "line",
          },
          {
            color: "var(--color-action)",
            formatter: (value) => `${value.toLocaleString("ko-KR")}명`,
            key: "recommendationFeedbackTalentCount",
            label: "피드백 참여자",
            type: "line",
          },
          {
            axis: "right",
            color: "var(--color-primary)",
            formatter: formatAcceptRejectRatio,
            key: "recommendationAcceptRejectRatio",
            label: "수락 / 거절",
            type: "line",
          },
        ]}
        changeChart="recommendationFeedback"
        title="추천 수락 · 거절"
      />
      <MetricChart
        data={trend}
        description="선은 그 기간에 처음 받은 internal 추천 전원 중, 추천 후 14일 안에 talent가 수락한 비율입니다(왼쪽 축). 추천받은 지 14일이 안 된 건은 지금까지 수락한 것만 세므로, 최근 기간의 값은 시간이 지나며 오를 수 있습니다. 막대는 각 기간의 Internal Role 추천 건수입니다(오른쪽 축). 같은 Role을 여러 후보자에게 추천하면 각각 집계합니다."
        percentAxis
        rightAxisFormatter={(value) => `${value.toLocaleString("ko-KR")}건`}
        series={[
          {
            axis: "right",
            color: "var(--color-neutral-1000-a10)",
            formatter: (value) => `${value.toLocaleString("ko-KR")}건`,
            key: "internalRecommendationCount",
            label: "Internal Role 추천 수",
            type: "bar",
          },
          {
            color: "var(--color-positive)",
            formatter: formatPercent,
            key: "internalAcceptanceRate",
            label: "Internal 추천 수락률",
            type: "line",
          },
        ]}
        changeChart="internalAcceptance"
        title="Internal 추천 수락률"
      />
    </div>
  );
}

export function OpsTalentMetricsEngagementCharts({
  dailyActivity,
  retention,
  trend,
}: {
  dailyActivity: OpsTalentMetricDailyActivityPoint[];
  retention: OpsTalentMetricRetentionPoint[];
  trend: OpsTalentMetricEngagementTrendPoint[];
}) {
  return (
    <div className="grid lg:grid-cols-2 lg:gap-x-8">
      <MetricChart
        data={trend}
        description="선택한 간격(일·주·월)마다 talent가 보낸 user 역할 메시지의 전체 개수와 본문 Unicode 글자 수 합계입니다. 가입일부터 누적하지 않습니다."
        series={[
          {
            color: "var(--color-action)",
            key: "messageCount",
            label: "메시지",
            type: "bar",
          },
          {
            axis: "right",
            color: "var(--color-primary)",
            key: "messageCharacterCount",
            label: "글자 수",
            type: "line",
          },
        ]}
        changeChart="messages"
        title="사용자 메시지"
      />
      <ActivityChart
        color="var(--color-action)"
        data={dailyActivity}
        description="날짜별 고유 활성 talent입니다. 메시지, 로그인, Career 행동, 추천 열람·클릭·피드백을 활동으로 봅니다. Harper가 talent 대신 실행한 작업은 세지 않습니다. 선: 7일 평균(그날 포함 지난 7일 DAU의 평균, 진행 중인 오늘 제외). 날마다 센 인원의 평균이라 WAU(7일 동안의 고유 인원)와 다릅니다."
        metricKey="activeTalentCount"
        changeChart="dau"
        title="DAU"
        trendLabel="7일 평균"
        type="bar"
      />
      <WeeklyActivityChart data={retention} />
    </div>
  );
}

const CHANNEL_COLORS = [
  "var(--color-primary)",
  "var(--color-action)",
  "var(--color-blue-700)",
  "var(--color-info)",
  "var(--color-positive)",
  "var(--color-accent-600)",
  "var(--color-neutral-600)",
];

function formatCount(unit: string) {
  return (value: number) => `${value.toLocaleString("ko-KR")}${unit}`;
}

type OverviewValueKey = {
  [K in keyof OpsTalentMetricOverviewTrendPoint]-?: OpsTalentMetricOverviewTrendPoint[K] extends
    | number
    | null
    | undefined
    ? K
    : never;
}[keyof OpsTalentMetricOverviewTrendPoint];

type OverviewSeries = {
  axis?: "left" | "right";
  color: string;
  format: (value: number) => string;
  key: OverviewValueKey;
  label: string;
};

type NestedOverviewPoint = OpsTalentMetricOverviewTrendPoint & {
  nestedInner: number | null;
  nestedRest: number | null;
};

function SeriesLegend({ items }: { items: OverviewSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <span
          className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted"
          key={item.key}
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function OverviewSeriesTooltip({
  active,
  chart,
  payload,
  series,
}: {
  active?: boolean;
  chart: OpsTalentChartKey;
  payload?: ReadonlyArray<{ payload?: OpsTalentMetricOverviewTrendPoint }>;
  series: OverviewSeries[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <OpsChartTooltipBox
      chart={chart}
      point={point}
      rows={series.map((item) => {
        const value = point[item.key];
        return {
          color: item.color,
          key: item.key,
          label: item.label,
          value: typeof value === "number" ? item.format(value) : "-",
        };
      })}
      title={point.fullLabel}
    />
  );
}

/**
 * Per bucket, a bar for `nested.outer` with `nested.inner` filling it from the bottom in its own color (as the WAU
 * chart stacks weekdays), and `lines` over it. The bar is drawn as inner + (outer − inner); the tooltip shows the
 * values themselves.
 */
function OverviewTrendChart({
  changeChart,
  lines = [],
  nested,
  trend,
}: {
  changeChart: OpsTalentChartKey;
  lines?: OverviewSeries[];
  nested?: { inner: OverviewSeries; outer: OverviewSeries };
  trend: OpsTalentMetricOverviewTrendPoint[];
}) {
  const data: NestedOverviewPoint[] = trend.map((point) => {
    const outer = nested ? point[nested.outer.key] : null;
    const inner = nested ? point[nested.inner.key] : null;
    const innerValue = typeof inner === "number" ? inner : null;
    return {
      ...point,
      nestedInner: innerValue,
      nestedRest: typeof outer === "number" ? Math.max(0, outer - (innerValue ?? 0)) : null,
    };
  });
  const series = [...(nested ? [nested.outer, nested.inner] : []), ...lines];
  const left = nested?.outer ?? lines.find((line) => line.axis !== "right");
  const right = lines.find((line) => line.axis === "right");
  const marks = useOpsChangeMarks(changeChart, trend);
  const openChanges = useOpenChanges();
  return (
    <ResponsiveContainer height="100%" width="100%">
      <ComposedChart data={data} margin={{ left: 0, right: 6, top: 8 }}>
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
          allowDecimals={left?.format === formatPercent}
          axisLine={false}
          domain={[0, "auto"]}
          fontSize={11}
          tick={{ fill: "var(--color-neutral-soft)" }}
          tickFormatter={left?.format}
          tickLine={false}
          width={46}
          yAxisId="left"
        />
        {right ? (
          <YAxis
            allowDecimals={right.format === formatPercent}
            axisLine={false}
            domain={[0, "auto"]}
            fontSize={11}
            orientation="right"
            tick={{ fill: "var(--color-neutral-soft)" }}
            tickFormatter={right.format}
            tickLine={false}
            width={46}
            yAxisId="right"
          />
        ) : null}
        {changeMarkLines(marks, openChanges, { yAxisId: "left" })}
        <Tooltip content={<OverviewSeriesTooltip chart={changeChart} series={series} />} />
        {/* recharts 2 finds Bar children by type, so they cannot sit inside a fragment. */}
        {nested ? (
          <Bar
            dataKey="nestedInner"
            fill={nested.inner.color}
            isAnimationActive={false}
            maxBarSize={32}
            stackId="nested"
            yAxisId="left"
          />
        ) : null}
        {nested ? (
          <Bar
            dataKey="nestedRest"
            fill={nested.outer.color}
            isAnimationActive={false}
            maxBarSize={32}
            radius={[2, 2, 0, 0]}
            stackId="nested"
            yAxisId="left"
          />
        ) : null}
        {lines.map((line) => (
          <Line
            activeDot={{ fill: line.color, r: 4, strokeWidth: 0 }}
            connectNulls={false}
            dataKey={line.key}
            dot={{ fill: line.color, r: 2, strokeWidth: 0 }}
            isAnimationActive={false}
            key={line.key}
            stroke={line.color}
            strokeWidth={2}
            type="monotone"
            yAxisId={line.axis ?? "left"}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const APPLY_CONFIRMED: OverviewSeries = {
  color: "var(--color-action)",
  format: formatCount("건"),
  key: "applyConfirmed",
  label: "최종 컨펌",
};
const APPLY_SUBMITTED: OverviewSeries = {
  color: "var(--color-positive)",
  format: formatCount("건"),
  key: "applySubmitted",
  label: "제출 완료",
};
const APPLY_SUCCESS_RATE: OverviewSeries = {
  axis: "right",
  color: "var(--color-primary)",
  format: formatPercent,
  key: "applySuccessRate",
  label: "성공률",
};

function ApplySuccessChart({ trend }: { trend: OpsTalentMetricOverviewTrendPoint[] }) {
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="flex min-h-8 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ChartTitle
          description="최종 컨펌은 talent가 Harper에게 실행을 승인한 지원이고, 제출 완료는 그중 Gmail 발송이 성공했거나 회사 사이트 제출이 확인된 지원입니다(컨펌한 기간 기준). 성공률은 제출 완료 ÷ 최종 컨펌입니다. 사이트 제출은 실행 보고의 첫 문장이 제출 완료를 말할 때만 셉니다."
          title="대신지원 성공률"
        />
        <SeriesLegend items={[APPLY_CONFIRMED, APPLY_SUBMITTED, APPLY_SUCCESS_RATE]} />
      </div>
      <div className="mt-3 h-[260px] w-full">
        <OverviewTrendChart
          changeChart="applySuccess"
          lines={[APPLY_SUCCESS_RATE]}
          nested={{ inner: APPLY_SUBMITTED, outer: APPLY_CONFIRMED }}
          trend={trend}
        />
      </div>
    </section>
  );
}

const APPLY_CLICK_24H: OverviewSeries = {
  color: "var(--color-info)",
  format: formatPercent,
  key: "applyClickRate24h",
  label: "24시간 안 지원하기",
};
const APPLY_HARPER_24H: OverviewSeries = {
  color: "var(--color-primary)",
  format: formatPercent,
  key: "applyHarperRate24h",
  label: "24시간 안 Harper와 지원하기",
};
const APPLY_HARPER_96H_RATE: OverviewSeries = {
  color: "var(--color-blue-700)",
  format: formatPercent,
  key: "applyHarperRate96h",
  label: "96시간 안 Harper와 지원하기 비율",
};
const APPLY_HARPER_96H_TALENTS: OverviewSeries = {
  axis: "right",
  color: "var(--color-neutral-600)",
  format: formatCount("명"),
  key: "applyHarperTalents96h",
  label: "96시간 안 Harper와 지원하기 인원",
};

function ApplyDelegationChart({ trend }: { trend: OpsTalentMetricOverviewTrendPoint[] }) {
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="flex min-h-8 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <ChartTitle
          description="그 기간 가입자 전원 중 가입부터 24시간·96시간 안에 기회 카드의 '지원하기'를 누른 사람과, 그 창에서 'Harper와 지원하기'를 한 번이라도 누른 사람의 비율입니다. 채팅 카드에서 연 지원 창은 '지원하기' 기록이 없어 'Harper와 지원하기'를 누른 경우만 셉니다. 가입한 지 24시간·96시간이 안 된 사람은 지금까지 누른 것만 세므로, 최근 기간의 값은 시간이 지나며 오를 수 있습니다."
          title="대신 지원을 맡기는 비율"
        />
        <SeriesLegend
          items={[APPLY_CLICK_24H, APPLY_HARPER_24H, APPLY_HARPER_96H_RATE, APPLY_HARPER_96H_TALENTS]}
        />
      </div>
      <div className="mt-3 h-[260px] w-full">
        <OverviewTrendChart
          changeChart="applyDelegation"
          lines={[APPLY_HARPER_96H_RATE, APPLY_HARPER_96H_TALENTS]}
          nested={{ inner: APPLY_HARPER_24H, outer: APPLY_CLICK_24H }}
          trend={trend}
        />
      </div>
    </section>
  );
}

export function OpsTalentMetricsOverviewCharts({
  trend,
}: {
  trend: OpsTalentMetricOverviewTrendPoint[];
}) {
  return (
    <div className="grid lg:grid-cols-2 lg:gap-x-8">
      <MetricChart
        data={trend}
        description="외부 연결은 talent가 Harper에게 지원을 맡기고 최종 컨펌한 뒤 실제로 Gmail 발송이나 회사 사이트 제출이 끝난 수입니다. 내부 연결은 contact_company로 Harper 고객사 에이전트에 소개가 전달된 수입니다."
        series={[
          {
            color: "var(--color-primary)",
            formatter: formatCount("건"),
            key: "externalConnections",
            label: "외부",
            stack: "connections",
            type: "bar",
          },
          {
            color: "var(--color-neutral-600)",
            formatter: formatCount("건"),
            key: "internalConnections",
            label: "내부",
            stack: "connections",
            type: "bar",
          },
        ]}
        changeChart="connections"
        title="연결 추이"
      />
      <MetricChart
        data={trend}
        description="가입한 시점 기준입니다. 채널은 매일 GTM 리포트와 같은 규칙(로그인한 브라우저의 UTM·유입 경로)으로 정합니다. /jobs 공고를 거쳤어도 UTM이 링크드인이면 링크드인입니다."
        series={OVERVIEW_CHANNELS.map((channel, index) => ({
          color: CHANNEL_COLORS[index],
          formatter: formatCount("명"),
          key: `signups_${channel.key}` as const,
          label: channel.label,
          stack: "signups",
          type: "bar" as const,
        }))}
        changeChart="signups"
        title="신규 가입 · 채널별"
      />
      <MetricChart
        data={trend}
        description="각 기간에 메시지, 로그인, Career 행동, 추천 열람·클릭·피드백을 한 번 이상 남긴 고유 talent입니다. Harper가 대신 실행한 작업은 세지 않습니다."
        series={[
          {
            color: "var(--color-action)",
            formatter: formatCount("명"),
            key: "activeTalents",
            label: "활동 유저",
            type: "bar",
          },
        ]}
        changeChart="activeTalents"
        title="활동 유저"
      />
      <MetricChart
        data={trend}
        description="그 기간 가입자 전원 중 가입부터 24시간·7일 안에 Gmail을 연동한 비율입니다. 가입한 지 24시간·7일이 안 된 사람은 지금까지 연동한 것만 세므로, 최근 기간의 값은 시간이 지나며 오를 수 있습니다. 연동을 끊으면 기록이 지워져 세지 않습니다."
        leftAxisFormatter={formatPercent}
        series={[
          {
            color: "var(--color-primary)",
            formatter: formatPercent,
            key: "gmailRate7d",
            label: "가입 7일 안",
            type: "line",
          },
          {
            color: "var(--color-neutral-600)",
            formatter: formatPercent,
            key: "gmailRate24h",
            label: "가입 24시간 안",
            type: "line",
          },
        ]}
        changeChart="gmail"
        title="Gmail 연동률"
      />
      <ApplyDelegationChart trend={trend} />
      <ApplySuccessChart trend={trend} />
    </div>
  );
}
