import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { ChevronRight, Info, LoaderCircle, RefreshCw } from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { OpsChangeMarksProvider } from "@/components/ops/metrics/OpsChartTooltip";
import OpsMetricSnapshotStamp from "@/components/ops/metrics/OpsMetricSnapshotStamp";
import {
  formatUpdateMetricDelta,
  formatUpdateMetricValue,
  updateMetricPoints,
  updateMetricSeriesColors,
  type UpdateMetricPoint,
} from "@/components/ops/metrics/updateMetricPoints";
import { cx } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsTrackedChanges, useOpsUpdateMetrics } from "@/hooks/ops/useOpsUpdateMetrics";
import { isInternalEmail } from "@/lib/internalAccess";
import { OPS_TALENT_METRICS_QUICK_RANGE_DAYS } from "@/lib/ops/talentMetrics";
import {
  OPS_HEADLINE_CHART,
  OPS_TRACKED_CHANGES,
  trackedChangeComparison,
  UPDATE_METRICS,
  UPDATE_METRICS_BEFORE_DAYS,
  type OpsTrackedChange,
  type OpsUpdateMetricsResponse,
  type UpdateMetricChart,
  type UpdateMetricKey,
} from "@/lib/ops/updateMetrics";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";
import {
  useOpsUpdateMetricsFilterStore,
  type OpsUpdateMetricsInterval,
} from "@/store/useOpsUpdateMetricsFilterStore";

// 배포 후 실험중인 지표. 화면 원칙(대표 지표 하나 + 작업 단위별 접히는 줄, 화면에서 추적 종료, 일·주 단위, 최소 글씨,
// 그래프에는 영향을 주는 중요한 변화만 표시)은 src/lib/ops/updateMetrics.ts 맨 위 주석에 있다. 이 화면을 고치기 전에 그
// 주석을 먼저 읽는다. /ops 그래프의 변화 표시를 누르면 ?change=<key,...>로 이 화면에 와서 그 줄이 열린다.

const OpsUpdateMetricChart = dynamic(
  () => import("@/components/ops/metrics/OpsUpdateMetricChart"),
  {
    loading: () => <div className="h-[240px]" />,
    ssr: false,
  }
);

const shortDay = (day: string) => `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}`;

function InfoHint({ label, text }: { label: string; text: string }) {
  return (
    <Tooltips side="top" text={text}>
      <MuteButton aria-label={`${label} 설명`} className="-my-1" size="sm" variant="transparent">
        <Info className="h-3 w-3" aria-hidden />
      </MuteButton>
    </Tooltips>
  );
}

/** ⓘ text of a chart: what each series counts. */
function chartDetail(chart: UpdateMetricChart) {
  return [...(chart.lines ?? []), ...(chart.bars ?? [])]
    .map((key) => `${UPDATE_METRICS[key].label}: ${UPDATE_METRICS[key].detail}`)
    .join("\n\n");
}

function Legend({ chart }: { chart: UpdateMetricChart }) {
  const colors = updateMetricSeriesColors(chart);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {(chart.lines ?? []).map((key) => (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted" key={key}>
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ backgroundColor: colors.get(key) }} />
          {UPDATE_METRICS[key].label}
        </span>
      ))}
      {(chart.bars ?? []).map((key) => (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted" key={key}>
          <span aria-hidden className="h-2 w-2 rounded-sm" style={{ backgroundColor: colors.get(key) }} />
          {UPDATE_METRICS[key].label}
        </span>
      ))}
    </div>
  );
}

function Comparison({
  change,
  data,
}: {
  change: Pick<OpsTrackedChange, "deployedOn" | "primary">;
  data: OpsUpdateMetricsResponse;
}) {
  const { after, before } = trackedChangeComparison(data, change);
  const unit = UPDATE_METRICS[change.primary].unit;
  const delta = formatUpdateMetricDelta(change.primary, before, after);
  return (
    <span className="inline-flex items-baseline gap-1.5 tabular-nums">
      <span className="text-neutral-muted">{UPDATE_METRICS[change.primary].label}</span>
      <span className="text-neutral-muted">{formatUpdateMetricValue(unit, before, "period")}</span>
      <span aria-hidden className="text-neutral-soft">→</span>
      <span className="font-medium text-neutral-primary">{formatUpdateMetricValue(unit, after, "period")}</span>
      {delta.text ? (
        <span
          className={cx(
            "text-[12px]",
            delta.better === true && "text-positive",
            delta.better === false && "text-critical",
            delta.better === null && "text-neutral-muted"
          )}
        >
          {delta.text}
        </span>
      ) : null}
    </span>
  );
}

function ChangeRow({
  change,
  data,
  ended,
  onToggleOpen,
  onToggleTracking,
  open,
  points,
  saving,
}: {
  change: OpsTrackedChange;
  data: OpsUpdateMetricsResponse | undefined;
  ended: boolean;
  onToggleOpen: () => void;
  onToggleTracking: () => void;
  open: boolean;
  points: UpdateMetricPoint[];
  saving: boolean;
}) {
  return (
    <section className="scroll-mt-20 border-b border-neutral-1000-a05" id={`change-${change.key}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
        <button
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggleOpen}
          type="button"
        >
          <ChevronRight
            aria-hidden
            className={cx("h-4 w-4 shrink-0 text-neutral-soft transition-transform", open && "rotate-90")}
          />
          <span className="truncate text-sm font-medium text-neutral-primary">{change.title}</span>
          <span className="shrink-0 text-[12px] tabular-nums text-neutral-soft">{shortDay(change.deployedOn)}</span>
        </button>
        <InfoHint label={change.title} text={change.detail} />
        {change.links.map((link) => (
          <a
            className="text-[12px] text-neutral-muted underline-offset-2 hover:text-neutral-primary hover:underline"
            href={link.url}
            key={link.url}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
          </a>
        ))}
        {data ? (
          <span className="text-[13px]">
            <Comparison change={change} data={data} />
          </span>
        ) : null}
        <MuteButton disabled={saving} onClick={onToggleTracking} size="sm" variant="transparent">
          {ended ? "다시 추적" : "추적 종료"}
        </MuteButton>
      </div>
      {open ? (
        <div className="pb-5 pl-6">
          <div className="flex min-h-6 items-start justify-between gap-3">
            <Legend chart={change} />
            <InfoHint label={`${change.title} 지표`} text={chartDetail(change)} />
          </div>
          <div className="mt-2">
            <OpsUpdateMetricChart
              chart={change}
              changeChart={{ change: change.key }}
              points={points}
              showMarkNames={false}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function OpsUpdateMetricsWorkspace() {
  const from = useOpsUpdateMetricsFilterStore((state) => state.from);
  const to = useOpsUpdateMetricsFilterStore((state) => state.to);
  const interval = useOpsUpdateMetricsFilterStore((state) => state.interval);
  const hasHydrated = useOpsUpdateMetricsFilterStore((state) => state.hasHydrated);
  const setDateRange = useOpsUpdateMetricsFilterStore((state) => state.setDateRange);
  const setInterval = useOpsUpdateMetricsFilterStore((state) => state.setInterval);
  const setQuickRange = useOpsUpdateMetricsFilterStore((state) => state.setQuickRange);
  const authLoading = useAuthStore((state) => state.loading);
  const userEmail = useAuthStore((state) => state.user?.email);
  const exclusionTerms = useOpsInternalDataExclusionStore((state) => state.emailExclusionTerms);
  const canFetch = !authLoading && hasHydrated && Boolean(from && to) && isInternalEmail(userEmail);
  const query = useOpsUpdateMetrics(canFetch, { excludedEmails: exclusionTerms, from, to });
  const tracking = useOpsTrackedChanges(canFetch);
  const router = useRouter();
  // Rows a team member opened or closed by hand since the last ?change= (a mark clicked on a /ops chart); the others
  // follow that request, so clicking a mark again reopens its rows.
  const [toggledFor, setToggledFor] = useState<{ map: Map<string, boolean>; request: string }>(() => ({
    map: new Map(),
    request: "",
  }));
  const [showEndedByHand, setShowEndedByHand] = useState<boolean | null>(null);
  const requested = typeof router.query.change === "string" ? router.query.change : "";
  const requestedKeys = new Set(requested.split(",").filter(Boolean));
  const data = query.data;
  const isUpdating = query.isFetching || Boolean(data?.snapshot.refreshing);

  useEffect(() => {
    if (!hasHydrated || (from && to)) return;
    setQuickRange(30);
  }, [from, hasHydrated, setQuickRange, to]);

  // A mark clicked on a /ops chart: scroll to the first change it opened.
  const hasData = Boolean(query.data?.days);
  useEffect(() => {
    const first = requested.split(",").find(Boolean);
    if (!first || !hasData) return;
    requestAnimationFrame(() =>
      document.getElementById(`change-${first}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    );
  }, [requested, hasData]);
  const toggled = toggledFor.request === requested ? toggledFor.map : new Map<string, boolean>();
  const isOpen = (key: string) => toggled.get(key) ?? requestedKeys.has(key);
  const toggleOpen = (key: string) =>
    setToggledFor({ map: new Map(toggled).set(key, !isOpen(key)), request: requested });

  const points = data?.days ? updateMetricPoints(data, { from, to }, interval) : [];
  const active = OPS_TRACKED_CHANGES.filter((change) => !tracking.ended.has(change.key));
  const ended = OPS_TRACKED_CHANGES.filter((change) => tracking.ended.has(change.key));
  const showEnded = showEndedByHand ?? ended.some((change) => requestedKeys.has(change.key));
  const toggle = (change: OpsTrackedChange) =>
    tracking.mutation.mutate({ ended: !tracking.ended.has(change.key), key: change.key });

  return (
    <OpsChangeMarksProvider changes={active} interval={interval}>
      <header className="border-b border-neutral-1000-a05 pb-5 pt-2">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <h1 className="mt-1 font-hedvig text-[2rem] leading-none tracking-[-0.06em] text-neutral-primary">
            배포 후 실험중인 지표
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {OPS_TALENT_METRICS_QUICK_RANGE_DAYS.map((days) => (
              <MuteButton key={days} onClick={() => setQuickRange(days)} size="sm" variant="transparent">
                {days}일
              </MuteButton>
            ))}
            <OpsDateRangeFilter
              activeButtonClassName="border-neutral-1000-a10 bg-transparent text-neutral-primary"
              emptyLabel="기간 선택"
              from={from}
              inactiveButtonClassName="border-neutral-1000-a10 bg-transparent text-neutral-muted hover:text-neutral-primary"
              onChange={(nextFrom, nextTo) => {
                if (!nextFrom || !nextTo) return;
                setDateRange(nextFrom, nextTo);
              }}
              to={to}
            />
            <Tabs
              activeValue={interval}
              className="w-fit"
              items={[
                { label: "일", value: "day" },
                { label: "주", value: "week" },
              ]}
              onValueChange={(value) => setInterval(value as OpsUpdateMetricsInterval)}
              size="small"
              variant="borderless"
            />
            <OpsMetricSnapshotStamp snapshots={[data?.snapshot]} />
            <MuteButton
              aria-label="지표 다시 집계"
              disabled={!canFetch || isUpdating}
              onClick={() => void query.refresh()}
              variant="transparent"
            >
              <RefreshCw className={cx("h-4 w-4", isUpdating && "animate-spin")} />
            </MuteButton>
          </div>
        </div>
      </header>

      {data?.days ? (
        <>
          <section className="border-b border-neutral-1000-a05 py-5">
            <div className="flex min-h-8 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-1">
                <h2 className="text-sm font-semibold text-neutral-primary">가입 → 3일 안 채팅</h2>
                <InfoHint
                  label="가입 → 3일 안 채팅"
                  text={`${chartDetail(OPS_HEADLINE_CHART)}\n\n세로 점선은 아래에서 추적 중인 변화의 배포일입니다. 점선 위 이름을 누르면 그 변화가 열립니다. 접힌 줄의 숫자는 배포 전 ${UPDATE_METRICS_BEFORE_DAYS}일과 배포일부터 지금까지를 비교합니다(건수는 하루 평균).`}
                />
              </div>
              <Legend chart={OPS_HEADLINE_CHART} />
            </div>
            <div className="mt-3">
              <OpsUpdateMetricChart
                chart={OPS_HEADLINE_CHART}
                changeChart="headline"
                height={280}
                points={points}
              />
            </div>
          </section>

          {tracking.mutation.error instanceof Error ? (
            <div className="border-b border-critical/25 py-2 text-sm text-critical">
              {tracking.mutation.error.message}
            </div>
          ) : null}

          {active.map((change) => (
            <ChangeRow
              change={change}
              data={data}
              ended={false}
              key={change.key}
              onToggleOpen={() => toggleOpen(change.key)}
              onToggleTracking={() => toggle(change)}
              open={isOpen(change.key)}
              points={points}
              saving={tracking.mutation.isPending}
            />
          ))}

          {ended.length > 0 ? (
            <section className="pt-4">
              <button
                aria-expanded={showEnded}
                className="flex items-center gap-2 text-[13px] text-neutral-muted hover:text-neutral-primary"
                onClick={() => setShowEndedByHand(!showEnded)}
                type="button"
              >
                <ChevronRight aria-hidden className={cx("h-4 w-4 transition-transform", showEnded && "rotate-90")} />
                종료 {ended.length}
              </button>
              {showEnded
                ? ended.map((change) => (
                    <ChangeRow
                      change={change}
                      data={data}
                      ended
                      key={change.key}
                      onToggleOpen={() => toggleOpen(change.key)}
                      onToggleTracking={() => toggle(change)}
                      open={isOpen(change.key)}
                      points={points}
                      saving={tracking.mutation.isPending}
                    />
                  ))
                : null}
            </section>
          ) : null}
        </>
      ) : query.error instanceof Error ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-3 py-5 text-sm text-critical">
          <span>{query.error.message}</span>
          <MuteButton onClick={() => void query.refetch()} size="sm" variant="transparent">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            다시 불러오기
          </MuteButton>
        </div>
      ) : (
        <div className="flex min-h-40 items-center justify-center text-sm text-neutral-muted">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          집계 중
        </div>
      )}
    </OpsChangeMarksProvider>
  );
}
