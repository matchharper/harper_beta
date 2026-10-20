import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import {
  COMPANY_METRICS,
  type CompanyDashboard,
  type CompanyMetric,
} from "@/lib/ops/companyDashboardTypes";
import { MuteButton } from "@/components/ui/button";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";

export function useCompanyDashboard(
  enabled: boolean,
  days = 30,
  workspaceId?: string,
  directoryIds?: string[]
) {
  return useQuery({
    queryKey: [
      "opsCompany",
      "dashboard",
      days,
      workspaceId ?? "all",
      directoryIds?.join(",") ?? "metrics",
    ],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      fetchWithInternalAuth<CompanyDashboard>(
        `/api/internal/company/dashboard?days=${days}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ""}${directoryIds ? `&directoryIds=${directoryIds.join(",")}` : ""}`
      ),
  });
}
function companyColor(index: number) {
  return `hsl(${(index * 137.508 + 210) % 360} 55% 42%)`;
}
export function CompanyAnalytics({
  enabled,
  workspaceId,
}: {
  enabled: boolean;
  workspaceId?: string;
}) {
  const [days, setDays] = useState(30);
  const [chart, setChart] = useState<"bar" | "line">("bar");
  const query = useCompanyDashboard(enabled, days, workspaceId);
  const colors = useMemo(
    () =>
      new Map(
        [...(query.data?.companies ?? [])]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((company, index) => [company.id, companyColor(index)])
      ),
    [query.data?.companies]
  );
  return (
    <section
      className="space-y-3"
      aria-label="회사 통계"
      aria-busy={query.isFetching}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium">
          {workspaceId ? "회사 지표" : "전체 회사 지표"}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1" aria-label="그래프 유형">
            {(["bar", "line"] as const).map((value) => (
              <MuteButton
                key={value}
                size="sm"
                variant={chart === value ? "neutral" : "transparent"}
                aria-pressed={chart === value}
                onClick={() => setChart(value)}
              >
                {value === "bar"
                  ? workspaceId
                    ? "막대"
                    : "누적 막대"
                  : "추이"}
              </MuteButton>
            ))}
          </div>
          <div className="flex gap-1" aria-label="조회 기간">
            {[7, 30, 90].map((value) => (
              <MuteButton
                key={value}
                size="sm"
                variant={days === value ? "neutral" : "transparent"}
                aria-pressed={days === value}
                onClick={() => setDays(value)}
              >
                최근 {value}일
              </MuteButton>
            ))}
          </div>
        </div>
      </div>
      {query.isLoading ? (
        <div
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="통계를 불러오는 중입니다"
        >
          {Object.entries(COMPANY_METRICS).map(([key, metric]) => (
            <div
              key={key}
              className="min-h-60 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4"
            >
              <p className="text-sm font-medium">{metric.label}</p>
              <div
                aria-hidden
                className="mt-4 h-8 w-16 animate-pulse rounded bg-bg-weak motion-reduce:animate-none"
              />
              <div
                aria-hidden
                className="mt-5 h-24 animate-pulse rounded bg-bg-weak motion-reduce:animate-none"
              />
            </div>
          ))}
        </div>
      ) : query.error ? (
        <div role="alert" className="text-sm text-critical">
          통계를 불러오지 못했습니다.{" "}
          <MuteButton size="sm" onClick={() => void query.refetch()}>
            다시 시도
          </MuteButton>
        </div>
      ) : query.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(COMPANY_METRICS) as CompanyMetric[]).map((metric) => (
              <CompanyMetricChart
                key={metric}
                data={query.data}
                metric={metric}
                colors={colors}
                chart={chart}
                singleCompany={Boolean(workspaceId)}
              />
            ))}
          </div>
          <p className="text-xs text-neutral-muted">
            {query.data.from.replaceAll("-", ".")} —{" "}
            {query.data.through.replaceAll("-", ".")}
          </p>
        </>
      ) : null}
    </section>
  );
}

function CompanyMetricChart({
  data,
  metric,
  chart,
  singleCompany,
  colors,
}: {
  data: CompanyDashboard;
  metric: CompanyMetric;
  chart: "bar" | "line";
  singleCompany: boolean;
  colors: ReadonlyMap<string, string>;
}) {
  const total = data.points.reduce(
    (sum, point) => sum + (point.metric === metric ? point.value : 0),
    0
  );
  const rows = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, Record<string, string | number>>();
    for (
      let at = Date.parse(`${data.from}T00:00:00Z`);
      at <= Date.parse(`${data.through}T00:00:00Z`);
      at += 86400_000
    ) {
      const date = new Date(at).toISOString().slice(0, 10);
      byDate.set(date, {
        date,
        ...Object.fromEntries(data.companies.map((c) => [c.id, 0])),
      });
    }
    for (const point of data.points)
      if (point.metric === metric) {
        const row = byDate.get(point.date);
        if (row) row[point.workspaceId] = point.value;
      }
    return [...byDate.values()];
  }, [data, metric]);
  const totalsByCompany = new Map<string, number>();
  for (const point of data.points)
    if (point.metric === metric)
      totalsByCompany.set(
        point.workspaceId,
        (totalsByCompany.get(point.workspaceId) ?? 0) + point.value
      );
  const companies = data.companies
    .filter((c) => (totalsByCompany.get(c.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        (totalsByCompany.get(b.id) ?? 0) - (totalsByCompany.get(a.id) ?? 0)
    );
  const Chart = chart === "bar" ? BarChart : LineChart;
  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating p-4">
      <div className="flex items-center justify-between gap-3">
        <div role="heading" aria-level={3}>
          <ResponsiveLightTooltip
            trigger={COMPANY_METRICS[metric].label}
            triggerClassName="py-0 text-sm font-medium text-neutral-primary"
            mobileAriaLabel={`${COMPANY_METRICS[metric].label} 설명`}
          >
            {COMPANY_METRICS[metric].description}
          </ResponsiveLightTooltip>
        </div>
        <span className="text-3xl font-medium tracking-tight tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>
      <div
        className={singleCompany ? "h-28 w-full" : "h-40 w-full"}
        role="img"
        aria-label={`${COMPANY_METRICS[metric].label} 일별 그래프, 총 ${total}건`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <Chart
            data={rows}
            margin={{ top: 10, right: 10, bottom: 0, left: -20 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--color-neutral-1000-a05)"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) =>
                String(value).slice(5).replace("-", ".")
              }
              axisLine={false}
              tickLine={false}
              minTickGap={25}
              tick={{ fontSize: 12, fill: "var(--color-neutral-muted)" }}
            />
            <YAxis
              allowDecimals={false}
              tickCount={3}
              domain={[0, (max: number) => Math.max(max, 1)]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "var(--color-neutral-muted)" }}
            />
            <Tooltip
              wrapperStyle={{ pointerEvents: "auto" }}
              cursor={{ fill: "var(--color-neutral-1000-a05)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entries = payload
                  .filter((item) => Number(item.value) > 0)
                  .sort((a, b) => Number(b.value) - Number(a.value));
                return (
                  <div className="max-h-64 max-w-64 overflow-y-auto rounded-lg border border-neutral-1000-a10 bg-bg-floating p-3 text-xs shadow-sm">
                    <p className="mb-2 font-medium text-neutral-primary">
                      {String(label).replaceAll("-", ".")}
                    </p>
                    {entries.length ? (
                      entries.map((item) => (
                        <div
                          key={String(item.dataKey)}
                          className="flex items-baseline justify-between gap-4 py-0.5"
                        >
                          <span className="min-w-0 break-words text-neutral-primary">
                            <span
                              className="mr-1.5 inline-block h-2 w-2"
                              style={{ backgroundColor: item.color }}
                            />
                            {item.name}
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-neutral-primary">
                            {Number(item.value).toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-neutral-muted">기록 없음</p>
                    )}
                    {entries.length > 1 && (
                      <p className="mt-2 border-t border-neutral-1000-a10 pt-2 text-right font-medium text-neutral-primary">
                        합계{" "}
                        {entries
                          .reduce((sum, item) => sum + Number(item.value), 0)
                          .toLocaleString()}
                      </p>
                    )}
                  </div>
                );
              }}
            />
            {companies.map((c) =>
              chart === "bar" ? (
                <Bar
                  key={c.id}
                  dataKey={c.id}
                  name={c.name}
                  stackId="companies"
                  fill={
                    singleCompany ? "var(--color-primary)" : colors.get(c.id)
                  }
                  maxBarSize={32}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={c.id}
                  dataKey={c.id}
                  name={c.name}
                  stroke={
                    singleCompany ? "var(--color-primary)" : colors.get(c.id)
                  }
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      {!singleCompany && companies.length > 0 && (
        <details className="group text-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-1 text-neutral-muted [&::-webkit-details-marker]:hidden">
            <span>회사별 합계 · {companies.length}개 회사</span>
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {companies.map((c) => (
              <div
                key={c.id}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="min-w-0 break-words text-neutral-primary">
                  <span
                    className="mr-1.5 inline-block h-2 w-2"
                    style={{ backgroundColor: colors.get(c.id) }}
                  />
                  {c.name}
                </span>
                <span className="shrink-0 tabular-nums text-neutral-muted">
                  {totalsByCompany.get(c.id)?.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {!companies.length && (
        <p className="text-xs text-neutral-muted">
          이 기간에 기록된 활동이 없습니다.
        </p>
      )}
    </div>
  );
}
