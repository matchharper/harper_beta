import { Hourglass, Info } from "lucide-react";
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
  type: "bar" | "line";
};

const tooltipStyle = {
  background: "var(--color-bg-default)",
  border:
    "1px solid color-mix(in srgb, var(--color-neutral-1000) 10%, transparent)",
  borderRadius: "4px",
  boxShadow:
    "0 12px 30px color-mix(in srgb, var(--color-neutral-1000) 10%, transparent)",
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
              {item.label}
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
        data={trend}
        description="실제 연결이 시작된 고유 talent와 같은 기간 서비스 가능 talent-quarter로 정규화한 산출률입니다."
        series={[
          {
            color: "var(--color-action)",
            key: "connectedTalentCount",
            label: "상호 연결 talent",
            type: "bar",
          },
          {
            axis: "right",
            color: "var(--color-primary)",
            key: "verifiedConnectionYieldPer100TalentQuarters",
            label: "100명·분기당 연결",
            type: "line",
          },
        ]}
        title="검증된 상호 연결"
      />
      <MetricChart
        data={trend}
        description="각 기간에 명시적으로 수락·거절된 추천 수와 거절 1건당 수락 건수입니다. 거절이 0건인 기간에는 비율선을 표시하지 않습니다."
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
        description="처음 internal 추천을 받은 뒤 14일의 판단 기간이 모두 지난 추천 중, 14일 안에 talent가 수락한 비율입니다."
        percentAxis
        series={[
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
      <ActivityChart
        color="var(--color-neutral-1000-a10)"
        data={retention}
        description="월요일부터 일요일까지 각 주에 한 번 이상 활동한 고유 talent입니다. 진행 중인 주는 누적값입니다."
        metricKey="activeTalentCount"
        title="WAU"
        type="bar"
      />
    </div>
  );
}
