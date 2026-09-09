import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  DebuggingPageShell,
  SourceLimitNotice,
  formatAbsoluteKst,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOpsDebugInternalMatching } from "@/hooks/ops/useOpsDebugInternalMatching";
import type {
  OpsDebugInternalMatchingPeriodStats,
  OpsDebugInternalMatchingRoleMode,
} from "@/lib/ops/internalMatchingAnalytics";

const DAY_MS = 24 * 60 * 60 * 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function toKstDateOnly(value: number) {
  const date = new Date(value + KST_OFFSET_MS);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function presetRange(days: number) {
  const now = Date.now();
  return {
    from: toKstDateOnly(now - (days - 1) * DAY_MS),
    to: toKstDateOnly(now),
  };
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatHours(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 1) return `${Math.round(value * 60)}분`;
  if (value < 24) return `${value.toFixed(1)}시간`;
  return `${(value / 24).toFixed(1)}일`;
}

function Delta({
  current,
  lowerIsBetter = false,
  previous,
  unit = "pp",
}: {
  current: number | null;
  lowerIsBetter?: boolean;
  previous: number | null;
  unit?: "hours" | "pp";
}) {
  if (current === null || previous === null) {
    return <span className="text-neutral-soft">직전 동기간 비교 없음</span>;
  }
  const rawDelta = current - previous;
  const displayDelta = unit === "pp" ? rawDelta * 100 : rawDelta;
  const isImprovement = lowerIsBetter ? rawDelta < 0 : rawDelta > 0;
  const isFlat = Math.abs(displayDelta) < (unit === "pp" ? 0.05 : 0.05);
  const prefix = displayDelta > 0 ? "+" : displayDelta < 0 ? "−" : "";
  return (
    <span
      className={cx(
        isFlat
          ? "text-neutral-soft"
          : isImprovement
            ? "text-positive"
            : "text-critical"
      )}
    >
      직전 동기간 대비 {prefix}
      {unit === "pp"
        ? `${Math.abs(displayDelta).toFixed(1)}%p`
        : formatHours(Math.abs(displayDelta))}
    </span>
  );
}

function RateCard({
  count,
  denominator,
  description,
  label,
  lowerIsBetter,
  previousRate,
  rate,
}: {
  count: number;
  denominator: number;
  description: string;
  label: string;
  lowerIsBetter?: boolean;
  previousRate: number | null;
  rate: number | null;
}) {
  return (
    <section className={cx(opsTheme.panel, "p-4")} title={description}>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-neutral-primary">
        {formatPercent(rate)}
      </div>
      <div className="mt-1 text-xs tabular-nums text-neutral-muted">
        {count.toLocaleString()} / {denominator.toLocaleString()}
      </div>
      <div className="mt-3 text-[11px]">
        <Delta
          current={rate}
          lowerIsBetter={lowerIsBetter}
          previous={previousRate}
        />
      </div>
    </section>
  );
}

function VolumeCard({
  comparison,
  summary,
}: {
  comparison: OpsDebugInternalMatchingPeriodStats | null;
  summary: OpsDebugInternalMatchingPeriodStats;
}) {
  return (
    <section
      className={cx(opsTheme.panel, "p-4")}
      title="같은 후보자와 같은 Role의 반복 추천 row는 하나의 추천 페어로 묶습니다."
    >
      <div className={opsTheme.eyebrow}>추천 페어</div>
      <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-neutral-primary">
        {summary.cohortPairCount.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-neutral-muted">
        실제 노출 row {summary.exposureCount.toLocaleString()}건
      </div>
      <div className="mt-3 text-[11px] text-neutral-soft">
        {comparison
          ? `직전 동기간 ${comparison.cohortPairCount.toLocaleString()}쌍`
          : "직전 동기간 비교 없음"}
      </div>
    </section>
  );
}

function ResponseTimeCard({
  comparison,
  summary,
}: {
  comparison: OpsDebugInternalMatchingPeriodStats | null;
  summary: OpsDebugInternalMatchingPeriodStats;
}) {
  return (
    <section
      className={cx(opsTheme.panel, "p-4")}
      title="첫 추천 시점부터 후보자의 수락 또는 거절까지 걸린 시간의 중앙값입니다."
    >
      <div className={opsTheme.eyebrow}>응답 시간 중앙값</div>
      <div className="mt-2 text-[28px] font-semibold tracking-[-0.04em] text-neutral-primary">
        {formatHours(summary.medianResponseHours)}
      </div>
      <div className="mt-1 text-xs text-neutral-muted">
        응답 {summary.respondedCount.toLocaleString()}쌍 기준
      </div>
      <div className="mt-3 text-[11px]">
        <Delta
          current={summary.medianResponseHours}
          lowerIsBetter
          previous={comparison?.medianResponseHours ?? null}
          unit="hours"
        />
      </div>
    </section>
  );
}

const TREND_SERIES = [
  { color: "var(--color-action)", key: "responseRate", label: "응답률" },
  { color: "var(--color-positive)", key: "acceptanceRate", label: "수락률" },
  { color: "var(--color-critical)", key: "rejectionRate", label: "거절률" },
] as const;

const POST_ACCEPTANCE_SERIES = [
  {
    color: "var(--color-action)",
    key: "connectionReachedRate",
    label: "연결 대기 이상",
  },
  {
    color: "var(--color-positive)",
    key: "processEnteredRate",
    label: "회사 프로세스 진입",
  },
  {
    color: "var(--color-critical)",
    key: "acceptedArchivedRate",
    label: "수락 후 아카이브",
  },
] as const;

const tooltipStyle = {
  background: "var(--color-bg-floating)",
  border:
    "1px solid color-mix(in srgb, var(--color-neutral-1000) 10%, transparent)",
  borderRadius: "8px",
  boxShadow:
    "0 16px 40px color-mix(in srgb, var(--color-neutral-1000) 12%, transparent)",
  fontSize: "12px",
};

function TrendChart({
  data,
  description,
  series,
  title,
}: {
  data: Array<Record<string, unknown>>;
  description: string;
  series: ReadonlyArray<{ color: string; key: string; label: string }>;
  title: string;
}) {
  const labelByKey = Object.fromEntries(
    series.map((item) => [item.key, item.label])
  );
  return (
    <section className={cx(opsTheme.panel, "p-4")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-primary">
            {title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-muted">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {series.map((item) => (
            <span
              key={item.key}
              className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-neutral-soft">
          선택한 기간에 추천 페어가 없습니다.
        </div>
      ) : (
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12, top: 8 }}>
              <CartesianGrid
                stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="label"
                fontSize={11}
                minTickGap={24}
                tick={{ fill: "var(--color-neutral-soft)" }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                domain={[0, 1]}
                fontSize={11}
                tick={{ fill: "var(--color-neutral-soft)" }}
                tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  formatPercent(Number(value)),
                  labelByKey[String(name)] ?? String(name),
                ]}
                labelFormatter={(_, payload) =>
                  String(payload?.[0]?.payload?.fullLabel ?? "")
                }
              />
              {series.map((item) => (
                <Line
                  key={item.key}
                  connectNulls={false}
                  dataKey={item.key}
                  dot={{ fill: item.color, r: 2, strokeWidth: 0 }}
                  activeDot={{ fill: item.color, r: 4, strokeWidth: 0 }}
                  stroke={item.color}
                  strokeWidth={2}
                  type="monotone"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function ConversionPath({
  summary,
}: {
  summary: OpsDebugInternalMatchingPeriodStats;
}) {
  const rows = [
    { count: summary.cohortPairCount, label: "추천 페어" },
    { count: summary.acceptedCount, label: "후보자 수락" },
    { count: summary.connectionReachedCount, label: "연결 대기 이상 도달" },
    { count: summary.processEnteredCount, label: "회사 프로세스 진입" },
    { count: summary.finalOfferReachedCount, label: "최종 오퍼 도달" },
  ];
  return (
    <section className={cx(opsTheme.panel, "p-4")}>
      <h2 className="text-sm font-semibold text-neutral-primary">
        추천 이후 전환 경로
      </h2>
      <p className="mt-1 text-xs leading-5 text-neutral-muted">
        현재 상태와 누적 stage 변경 이력을 함께 사용한 도달 기준입니다.
      </p>
      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const value = rateForCount(row.count, summary.cohortPairCount);
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-neutral-muted">{row.label}</span>
                <span className="font-mono font-semibold text-neutral-primary">
                  {row.count.toLocaleString()} · {formatPercent(value)}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-weak">
                <div
                  className="h-full rounded-full bg-positive transition-[width]"
                  style={{ width: `${Math.max(0, (value ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function rateForCount(count: number, denominator: number) {
  return denominator > 0 ? count / denominator : null;
}

function StageDistribution({
  stages,
}: {
  stages: Array<{
    count: number;
    id: string;
    label: string;
    rate: number | null;
  }>;
}) {
  return (
    <section className={cx(opsTheme.panel, "p-4")}>
      <h2 className="text-sm font-semibold text-neutral-primary">
        현재 stage 분포
      </h2>
      <p className="mt-1 text-xs leading-5 text-neutral-muted">
        최신 internal tag를 우선하고, 없으면 projection과 피드백을 사용합니다.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stages.map((stage) => (
          <div key={stage.id} className={cx(opsTheme.panelSoft, "p-3")}>
            <div className="text-[11px] text-neutral-muted">{stage.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums text-neutral-primary">
                {stage.count.toLocaleString()}
              </span>
              <span className="text-[11px] text-neutral-soft">
                {formatPercent(stage.rate)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalCard({
  count,
  label,
  rate,
  tone = "neutral",
}: {
  count: number;
  label: string;
  rate: number | null;
  tone?: "critical" | "neutral";
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "p-3")}>
      <div className="text-[11px] leading-4 text-neutral-muted">{label}</div>
      <div
        className={cx(
          "mt-1.5 text-lg font-semibold tabular-nums",
          tone === "critical" ? "text-critical" : "text-neutral-primary"
        )}
      >
        {formatPercent(rate)}
      </div>
      <div className="mt-0.5 text-[11px] text-neutral-soft">
        {count.toLocaleString()}쌍
      </div>
    </div>
  );
}

function QualitySignals({
  summary,
}: {
  summary: OpsDebugInternalMatchingPeriodStats;
}) {
  return (
    <section className={cx(opsTheme.panel, "p-4")}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div>
          <h2 className="text-sm font-semibold text-neutral-primary">
            개선 감시 지표
          </h2>
          <p className="mt-1 text-xs leading-5 text-neutral-muted">
            무응답·정체·중단·반복 노출은 낮아지는 방향이 좋습니다.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <SignalCard
          count={summary.staleNoResponseCount}
          label="첫 추천 후 14일+ 무응답"
          rate={summary.staleNoResponseRate}
          tone="critical"
        />
        <SignalCard
          count={summary.acceptedStalledCount}
          label="수락 후 7일+ 연결 전 정체"
          rate={summary.acceptedStalledRate}
          tone="critical"
        />
        <SignalCard
          count={summary.processStoppedCount}
          label="수락 후 프로세스 중단"
          rate={summary.processStoppedRate}
          tone="critical"
        />
        <SignalCard
          count={summary.repeatedPairCount}
          label="같은 후보자×Role 반복 노출"
          rate={summary.repeatedPairRate}
        />
        <SignalCard
          count={summary.viewedCount}
          label="상세 조회"
          rate={summary.viewRate}
        />
        <SignalCard
          count={summary.clickedCount}
          label="상세 클릭"
          rate={summary.clickRate}
        />
      </div>
    </section>
  );
}

function RoleBreakdown({
  rows,
}: {
  rows: Array<{
    acceptedArchivedRate: number | null;
    acceptanceRate: number | null;
    companyName: string;
    connectionReachedRate: number | null;
    cohortPairCount: number;
    medianResponseHours: number | null;
    rejectionRate: number | null;
    responseRate: number | null;
    roleId: string;
    roleName: string;
  }>;
}) {
  return (
    <section className={cx(opsTheme.panel, "overflow-hidden")}>
      <div className="border-b border-neutral-1000-a05 px-4 py-3">
        <h2 className="text-sm font-semibold text-neutral-primary">
          회사·Role별 품질
        </h2>
        <p className="mt-1 text-xs leading-5 text-neutral-muted">
          추천 페어가 많은 순서입니다. 표본이 5쌍 미만인 비율은 방향성만
          확인하세요.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full border-collapse text-left text-xs">
          <thead className="bg-bg-weak text-neutral-muted">
            <tr>
              <th className="px-4 py-3 font-medium">회사 / Role</th>
              <th className="px-3 py-3 text-right font-medium">추천</th>
              <th className="px-3 py-3 text-right font-medium">응답률</th>
              <th className="px-3 py-3 text-right font-medium">수락률</th>
              <th className="px-3 py-3 text-right font-medium">거절률</th>
              <th className="px-3 py-3 text-right font-medium">
                수락→아카이브
              </th>
              <th className="px-3 py-3 text-right font-medium">연결 진행</th>
              <th className="px-4 py-3 text-right font-medium">응답 시간</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-1000-a05">
            {rows.map((row) => (
              <tr key={row.roleId} className="hover:bg-bg-weak/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-primary">
                    {row.roleName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-soft">
                    {row.companyName}
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-mono text-neutral-primary">
                  {row.cohortPairCount.toLocaleString()}
                </td>
                <td className="px-3 py-3 text-right font-mono text-neutral-muted">
                  {formatPercent(row.responseRate)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-positive">
                  {formatPercent(row.acceptanceRate)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-critical">
                  {formatPercent(row.rejectionRate)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-critical">
                  {formatPercent(row.acceptedArchivedRate)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-neutral-muted">
                  {formatPercent(row.connectionReachedRate)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-neutral-muted">
                  {formatHours(row.medianResponseHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-soft">
            선택한 기간에 집계할 Role이 없습니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default function OpsDebugInternalMatchingPage() {
  const initialRange = useMemo(() => presetRange(90), []);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [roleMode, setRoleMode] =
    useState<OpsDebugInternalMatchingRoleMode>("all");
  const canFetchInternal = useCanFetchInternal();
  const query = useOpsDebugInternalMatching(canFetchInternal, {
    from,
    roleMode,
    to,
  });
  const data = query.data;
  const summary = data?.summary;
  const comparison = data?.comparison ?? null;

  const setQuickRange = (days: number) => {
    const next = presetRange(days);
    setFrom(next.from);
    setTo(next.to);
  };

  return (
    <DebuggingPageShell
      tab="matching"
      filters={
        <div className="mt-4 flex flex-col gap-3 border-t border-neutral-1000-a05 pt-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            {[30, 90, 180].map((days) => (
              <MuteButton
                key={days}
                onClick={() => setQuickRange(days)}
                size="sm"
                variant={
                  from === presetRange(days).from && to === presetRange(days).to
                    ? "dark"
                    : "neutral"
                }
              >
                {days}일
              </MuteButton>
            ))}
            <OpsDateRangeFilter
              emptyLabel="전체 기간"
              from={from}
              onChange={(nextFrom, nextTo) => {
                setFrom(nextFrom);
                setTo(nextTo);
              }}
              prefix="추천일"
              to={to}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select
              value={roleMode}
              onValueChange={(value) =>
                setRoleMode(value as OpsDebugInternalMatchingRoleMode)
              }
            >
              <SelectTrigger className="h-9 min-w-[150px] bg-bg-floating text-xs">
                <SelectValue placeholder="Role 방식" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 internal role</SelectItem>
                <SelectItem value="auto">자동 매칭 role</SelectItem>
                <SelectItem value="manual">수동 매칭 role</SelectItem>
              </SelectContent>
            </Select>
            <MuteButton
              aria-label="매칭 지표 새로고침"
              disabled={query.isFetching}
              onClick={() => query.refetch()}
              size="sm"
            >
              <RefreshCw
                className={cx(
                  "h-3.5 w-3.5",
                  query.isFetching && "animate-spin"
                )}
              />
              새로고침
            </MuteButton>
          </div>
        </div>
      }
    >
      {!canFetchInternal || query.isLoading ? (
        <div
          className={cx(
            opsTheme.panel,
            "flex min-h-[320px] items-center justify-center"
          )}
        >
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : query.error ? (
        <div className={opsTheme.errorNotice}>
          {query.error instanceof Error
            ? query.error.message
            : "매칭 지표를 불러오지 못했습니다."}
        </div>
      ) : summary && data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-neutral-soft">
            <span>
              코호트 기준: 후보자×Role의 첫 internal 추천일 · 테스트 Role 제외
            </span>
            <span>업데이트 {formatAbsoluteKst(data.generatedAt)} KST</span>
          </div>

          {data.sourceLimitReached ? <SourceLimitNotice /> : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <VolumeCard comparison={comparison} summary={summary} />
            <RateCard
              count={summary.acceptedCount}
              denominator={summary.cohortPairCount}
              description="추천 페어 중 후보자가 수락했거나 수락 이후 stage에 도달한 비율입니다."
              label="후보자 수락률"
              previousRate={comparison?.acceptanceRate ?? null}
              rate={summary.acceptanceRate}
            />
            <RateCard
              count={summary.rejectedCount}
              denominator={summary.cohortPairCount}
              description="추천 페어 중 후보자가 거절한 비율입니다."
              label="후보자 거절률"
              lowerIsBetter
              previousRate={comparison?.rejectionRate ?? null}
              rate={summary.rejectionRate}
            />
            <RateCard
              count={summary.acceptedArchivedCount}
              denominator={summary.acceptedCount}
              description="후보자가 수락한 페어 중 현재 최신 stage가 아카이브인 비율입니다."
              label="수락 후 아카이브율"
              lowerIsBetter
              previousRate={comparison?.acceptedArchivedRate ?? null}
              rate={summary.acceptedArchivedRate}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RateCard
              count={summary.respondedCount}
              denominator={summary.cohortPairCount}
              description="수락 또는 거절 결정이 기록된 추천 페어의 비율입니다."
              label="후보자 응답률"
              previousRate={comparison?.responseRate ?? null}
              rate={summary.responseRate}
            />
            <RateCard
              count={summary.connectionReachedCount}
              denominator={summary.acceptedCount}
              description="수락한 페어 중 연결 대기 또는 그 이후 stage에 한 번이라도 도달한 비율입니다."
              label="연결 진행률"
              previousRate={comparison?.connectionReachedRate ?? null}
              rate={summary.connectionReachedRate}
            />
            <RateCard
              count={summary.processEnteredCount}
              denominator={summary.acceptedCount}
              description="수락한 페어 중 회사의 실제 프로세스 stage에 한 번이라도 진입한 비율입니다."
              label="회사 프로세스 진입률"
              previousRate={comparison?.processEnteredRate ?? null}
              rate={summary.processEnteredRate}
            />
            <ResponseTimeCard comparison={comparison} summary={summary} />
          </div>

          <div className="grid gap-3 2xl:grid-cols-2">
            <TrendChart
              data={data.trend as unknown as Array<Record<string, unknown>>}
              description="각 주에 처음 추천된 고유 후보자×Role 코호트의 현재 결과입니다. 최근 주차는 관찰 기간이 짧습니다."
              series={TREND_SERIES}
              title="후보자 반응 추이"
            />
            <TrendChart
              data={data.trend as unknown as Array<Record<string, unknown>>}
              description="수락한 페어를 분모로 연결·프로세스 진입·현재 아카이브 비율을 비교합니다."
              series={POST_ACCEPTANCE_SERIES}
              title="수락 이후 품질 추이"
            />
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <ConversionPath summary={summary} />
            <QualitySignals summary={summary} />
          </div>

          <StageDistribution stages={data.stages} />
          <RoleBreakdown rows={data.breakdown} />

          <section
            className={cx(
              opsTheme.panelSoft,
              "px-4 py-3 text-xs leading-5 text-neutral-muted"
            )}
          >
            <span className="font-medium text-neutral-primary">
              집계 기준 ·{" "}
            </span>
            같은 후보자×Role의 중복 recommendation row는 한 페어로 묶고 첫
            추천일로 코호트를 정합니다. 최신 internal tag가 현재 stage의
            기준이며, tag가 없을 때만 processed stage와 후보자 피드백을
            사용합니다. 연결 및 회사 프로세스 도달은 현재 stage와 누적 stage
            변경 이력을 함께 봅니다. 직전 동기간 비교는 선택 기간과 같은 길이의
            바로 이전 기간입니다.
          </section>
        </>
      ) : null}
    </DebuggingPageShell>
  );
}
