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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_WEEKDAYS, latestObservedWeekday, weeklyActivityChartPoints, type WeeklyActivityChartPoint } from "@/lib/ops/talentMetricsPresentation";
import type {
  OpsTalentMetricDailyActivityPoint,
  OpsTalentMetricConversionTrendPoint,
  OpsTalentMetricEngagementTrendPoint,
  OpsTalentMetricRetentionPoint,
  OpsTalentMetricWeeklyRetentionCohort,
} from "@/lib/ops/talentMetrics";

type TrendPoint =
  | OpsTalentMetricConversionTrendPoint
  | OpsTalentMetricEngagementTrendPoint;

type ChartSeries = {
  axis?: "left" | "right";
  color: string;
  formatter?: (value: number) => string;
  key:
    | keyof OpsTalentMetricConversionTrendPoint
    | keyof OpsTalentMetricEngagementTrendPoint;
  label: string;
  legendLabel?: string;
  type: "bar" | "line";
};

const RECOMMENDATION_COUNT_DISPLAY_DIVISOR = 5;

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "var(--popover-border-width) solid var(--color-popover-border)",
  borderRadius: "var(--radius-popover)",
  boxShadow: "var(--shadow-popover)",
  backdropFilter: "blur(var(--blur-popover))",
  color: "var(--color-popover-foreground)",
  fontSize: "12px",
};

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
  data,
  description,
  percentAxis = false,
  rightAxisFormatter = formatDecimal,
  series,
  title,
}: {
  data: TrendPoint[];
  description: string;
  percentAxis?: boolean;
  rightAxisFormatter?: (value: number) => string;
  series: ChartSeries[];
  title: string;
}) {
  const seriesByKey = new Map(series.map((item) => [item.key, item]));
  const hasRightAxis = series.some((item) => item.axis === "right");
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
              tickFormatter={percentAxis ? formatPercent : formatDecimal}
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
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                const definition = seriesByKey.get(
                  String(name) as ChartSeries["key"]
                );
                const numericValue = Number(value);
                return [
                  definition?.formatter?.(numericValue) ??
                    formatDecimal(numericValue),
                  definition?.label ?? String(name),
                ];
              }}
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.fullLabel ?? "")
              }
            />
            {series.map((item) =>
              item.type === "bar" ? (
                <Bar
                  dataKey={item.key}
                  fill={item.color}
                  key={item.key}
                  maxBarSize={24}
                  radius={[2, 2, 0, 0]}
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

function ActivityChart({
  color,
  data,
  description,
  metricKey,
  percent = false,
  title,
  type,
}: {
  color: string;
  data: Array<
    OpsTalentMetricDailyActivityPoint | OpsTalentMetricRetentionPoint
  >;
  description: string;
  metricKey: "activeTalentCount" | "retentionRate";
  percent?: boolean;
  title: string;
  type: "bar" | "line";
}) {
  return (
    <section className="min-w-0 border-t border-neutral-1000-a05 py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="min-h-8">
        <ChartTitle description={description} title={title} />
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
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value) => [
                percent
                  ? formatPercent(Number(value))
                  : Number(value).toLocaleString("ko-KR"),
                title,
              ]}
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.fullLabel ?? "")
              }
            />
            {type === "bar" ? (
              <Bar
                dataKey={metricKey}
                fill={color}
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
    <div className="rounded-popover border border-popover-border bg-popover p-3 text-xs text-popover-foreground shadow-(--shadow-popover)">
      <div className="mb-2 font-medium">{point.fullLabel}</div>
      {ACTIVITY_WEEKDAYS.slice(0, throughDay + 1).map((day, index) => (
        <div className="flex items-center justify-between gap-5 py-0.5" key={day.key}>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: WEEKDAY_COLORS[index] }} />
            {day.label}요일까지
          </span>
          <span className="tabular-nums">
            {counts[index] == null
              ? "집계 전"
              : `${counts[index].toLocaleString("ko-KR")}명`}
          </span>
        </div>
      ))}
    </div>
  );
}

function WeeklyActivityChart({ data }: { data: OpsTalentMetricRetentionPoint[] }) {
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // Existing RPCs and cached responses contain only the whole-week total.
  // Keep that total readable until weekday counts are available for every week.
  if (data.some((point) => point.weekdayCumulativeActiveTalentCounts == null)) {
    return (
      <ActivityChart
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
        title="추천 수락 · 거절"
      />
      <MetricChart
        data={trend}
        description="선은 처음 internal 추천을 받은 뒤 14일의 판단 기간이 모두 지난 추천 중, 14일 안에 talent가 수락한 비율입니다(왼쪽 축). 막대는 각 기간의 Internal Role 추천 건수로, 미응답과 추천 후 14일이 지나지 않은 건도 포함합니다(오른쪽 축). 같은 Role을 여러 후보자에게 추천하면 각각 집계합니다."
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
        title="Internal 추천 수락률"
      />
      <MetricChart
        data={trend}
        description="가입 후 14일이 모두 지난 talent 중 가입일부터 14일 안에 온보딩을 완료한 비율입니다. 각 점은 가입한 일·주·월 cohort 기준입니다."
        percentAxis
        series={[
          {
            color: "var(--color-primary)",
            formatter: formatPercent,
            key: "onboardingCompletionRate",
            label: "14일 내 완료율",
            type: "line",
          },
        ]}
        title="온보딩 완료율"
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
        title="사용자 메시지"
      />
      <ActivityChart
        color="var(--color-action)"
        data={dailyActivity}
        description="날짜별 고유 활성 talent입니다. 메시지, 로그인, Career 행동, 추천 열람·클릭·피드백을 활동으로 봅니다."
        metricKey="activeTalentCount"
        title="DAU"
        type="bar"
      />
      <WeeklyActivityChart data={retention} />
    </div>
  );
}
