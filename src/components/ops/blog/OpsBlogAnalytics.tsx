import { cx, opsTheme } from "@/components/ops/theme";
import { Tabs } from "@/components/ui/tabs";
import type {
  OpsBlogAnalytics as OpsBlogAnalyticsData,
  OpsBlogAnalyticsPostMetrics,
  OpsBlogAnalyticsSummary,
} from "@/lib/ops/blogServer";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartMetric = "ctaClickers" | "visitors";

type ChartSeries = {
  color: string;
  key: string;
  slug: string;
  title: string;
};

type ChartRow = {
  date: string;
  details: OpsBlogAnalyticsPostMetrics[];
  label: string;
  summary: OpsBlogAnalyticsSummary;
} & Record<
  string,
  number | string | OpsBlogAnalyticsPostMetrics[] | OpsBlogAnalyticsSummary
>;

const CHART_COLORS = [
  "var(--color-primary)",
  "var(--color-action)",
  "var(--color-positive)",
  "var(--color-info)",
  "var(--color-blue-700)",
  "var(--color-accent-300)",
  "var(--color-green-700)",
  "var(--color-blue-300)",
  "var(--color-info-700)",
  "var(--color-neutral-700)",
  "var(--color-critical)",
] as const;

const METRIC_TABS = [
  { label: "방문자", value: "visitors" },
  { label: "CTA 클릭자", value: "ctaClickers" },
] as const;

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function formatDate(date: string) {
  return date.replaceAll("-", ".");
}

function formatShortDate(date: string) {
  return date.slice(5).replace("-", ".");
}

function BlogAnalyticsTooltip({
  active,
  payload,
  seriesBySlug,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
  seriesBySlug: Map<string, ChartSeries>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  const details = row.details
    .filter(
      (post) =>
        post.views > 0 ||
        post.ctaClicks > 0 ||
        post.postOpens > 0 ||
        post.jobOpens > 0 ||
        post.allJobsOpens > 0 ||
        post.copyClicks > 0
    )
    .sort(
      (left, right) =>
        right.visitors - left.visitors || right.ctaClickers - left.ctaClickers
    );

  return (
    <div className="max-w-[340px] rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 py-2.5 text-xs shadow-xl">
      <div className="border-b border-neutral-1000-a05 pb-2">
        <div className="font-medium text-neutral-primary">
          {formatDate(row.date)}
        </div>
        <div className="mt-1 text-neutral-muted">
          전체 방문자 {formatNumber(row.summary.visitors)}명 · 조회{" "}
          {formatNumber(row.summary.views)}회
        </div>
        <div className="mt-0.5 text-neutral-muted">
          CTA {formatNumber(row.summary.ctaClickers)}명/
          {formatNumber(row.summary.ctaClicks)}회 · 전환율{" "}
          {formatPercent(row.summary.conversionRate)}
        </div>
      </div>
      <div className="mt-2 grid gap-2.5">
        {details.map((post) => {
          const series = seriesBySlug.get(post.slug);
          return (
            <div className="grid gap-1" key={post.slug}>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: series?.color }}
                />
                <span className="truncate font-medium text-neutral-primary">
                  {series?.title ?? post.slug}
                </span>
              </div>
              <div className="pl-[18px] text-neutral-muted">
                방문자 {formatNumber(post.visitors)} · 조회{" "}
                {formatNumber(post.views)} · CTA{" "}
                {formatNumber(post.ctaClickers)}명/
                {formatNumber(post.ctaClicks)}회
                {post.postOpens > 0 &&
                  ` · 목록 클릭 ${formatNumber(post.postOpens)}`}
                {(post.jobOpens > 0 || post.allJobsOpens > 0) &&
                  ` · 채용공고 ${formatNumber(post.jobOpens + post.allJobsOpens)}`}
                {post.copyClicks > 0 &&
                  ` · 링크 복사 ${formatNumber(post.copyClicks)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-bg-floating p-4">
      <div className="text-xs text-neutral-muted">{label}</div>
      <div className="mt-2 text-2xl font-medium tabular-nums text-neutral-primary">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 text-xs tabular-nums text-neutral-soft">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export default function OpsBlogAnalytics({
  analytics,
  error,
  loading,
}: {
  analytics: OpsBlogAnalyticsData | null;
  error: string;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<ChartMetric>("visitors");
  const series = useMemo<ChartSeries[]>(
    () =>
      (analytics?.posts ?? []).map((post, index) => ({
        color:
          CHART_COLORS[index] ??
          `hsl(${Math.round((index * 137.5 + 24) % 360)} 55% 52%)`,
        key: `post_${index}`,
        slug: post.slug,
        title: post.title,
      })),
    [analytics?.posts]
  );
  const seriesBySlug = useMemo(
    () => new Map(series.map((item) => [item.slug, item])),
    [series]
  );
  const chartRows = useMemo<ChartRow[]>(
    () =>
      (analytics?.daily ?? []).map((day) => {
        const metricsBySlug = new Map(
          day.posts.map((post) => [post.slug, post])
        );
        const values = Object.fromEntries(
          series.map((item) => [
            item.key,
            metricsBySlug.get(item.slug)?.[metric] ?? 0,
          ])
        );
        return {
          ...values,
          date: day.date,
          details: day.posts,
          label: formatShortDate(day.date),
          summary: day.summary,
        };
      }),
    [analytics?.daily, metric, series]
  );

  if (loading && !analytics) {
    return (
      <section
        className={cx(
          opsTheme.panel,
          "flex h-72 items-center justify-center p-5 text-sm text-neutral-muted"
        )}
      >
        성과를 불러오는 중...
      </section>
    );
  }

  if (error && !analytics) {
    return <div className={opsTheme.errorNotice}>{error}</div>;
  }

  if (!analytics) return null;

  const hasActivity = analytics.posts.some(
    (post) => post.views > 0 || post.ctaClicks > 0
  );

  return (
    <div className="grid gap-5">
      {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}

      <section className={cx(opsTheme.panel, "p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-medium text-neutral-primary">
              최근 30일
            </h2>
            <div className="mt-1 text-xs text-neutral-muted">
              {formatDate(analytics.from)} – {formatDate(analytics.through)} ·
              KST
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="글 방문자"
            value={`${formatNumber(analytics.summary.visitors)}명`}
            detail={`${formatNumber(analytics.summary.views)}회 조회`}
          />
          <SummaryCard
            label="CTA 클릭자"
            value={`${formatNumber(analytics.summary.ctaClickers)}명`}
            detail={`${formatNumber(analytics.summary.ctaClicks)}회 클릭`}
          />
          <SummaryCard
            label="CTA 전환율"
            value={formatPercent(analytics.summary.conversionRate)}
          />
          <SummaryCard
            label="채용공고 이동"
            value={`${formatNumber(analytics.summary.jobOpens + analytics.summary.allJobsOpens)}회`}
            detail={`링크 복사 ${formatNumber(analytics.summary.copyClicks)}회`}
          />
        </div>
      </section>

      <section className={cx(opsTheme.panel, "overflow-hidden p-5")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-medium text-neutral-primary">
            일자별 성과
          </h2>
          <Tabs
            activeValue={metric}
            className="w-fit"
            items={[...METRIC_TABS]}
            onValueChange={(value) => setMetric(value as ChartMetric)}
            size="small"
            variant="pills"
          />
        </div>

        {!hasActivity ? (
          <div className="mt-4 flex h-64 items-center justify-center rounded-md bg-bg-weak text-sm text-neutral-muted">
            선택 기간에 블로그 방문 기록이 없습니다.
          </div>
        ) : (
          <>
            <div className="mt-5 h-[360px] min-w-0">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart
                  data={chartRows}
                  margin={{ bottom: 0, left: 0, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
                    vertical={false}
                  />
                  <XAxis
                    axisLine={false}
                    dataKey="label"
                    fontSize={11}
                    interval="preserveStartEnd"
                    minTickGap={18}
                    tick={{ fill: "var(--color-neutral-soft)" }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    fontSize={11}
                    tick={{ fill: "var(--color-neutral-soft)" }}
                    tickLine={false}
                    width={34}
                  />
                  <Tooltip
                    content={
                      <BlogAnalyticsTooltip seriesBySlug={seriesBySlug} />
                    }
                    cursor={{
                      fill: "color-mix(in srgb, var(--color-neutral-1000) 4%, transparent)",
                    }}
                  />
                  {series.map((item) => (
                    <Bar
                      dataKey={item.key}
                      fill={item.color}
                      key={item.slug}
                      maxBarSize={42}
                      stackId="posts"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-neutral-1000-a05 pt-4 text-xs text-neutral-muted">
              {series.map((item) => (
                <div
                  className="flex min-w-0 max-w-full items-center gap-1.5"
                  key={item.slug}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.title}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
