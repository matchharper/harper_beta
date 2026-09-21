import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  DebuggingPageShell,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOpsTalentActionLogs } from "@/hooks/ops/useOpsTalentActionLogs";
import {
  OPS_TALENT_ACTION_SECTIONS,
  OPS_TALENT_ACTION_SOURCE_GROUPS,
  type OpsTalentActionDefinition,
  type OpsTalentActionLogsResponse,
  type OpsTalentActionSourceGroup,
  type OpsTalentActionView,
} from "@/lib/ops/talentActionLogs";

const DAY_OPTIONS = [7, 14, 30, 60, 90] as const;
const WEEK_OPTIONS = [8, 12, 16, 24] as const;

type QueryState = {
  data?: OpsTalentActionLogsResponse;
  isError: boolean;
  isPending: boolean;
};

type TrendPoint = {
  cohortTotal: number;
  percentage: number;
  userCount: number;
  weekLabel: string;
  weekStart: string;
};

function formatPercentage(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatWeekLabel(value: string) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Seoul",
  });
}

function ActionCardSkeleton({ chart = false }: { chart?: boolean }) {
  return (
    <div className={cx(opsTheme.panel, "animate-pulse p-4")}>
      <div className="h-3 w-28 rounded bg-neutral-1000-a05" />
      <div className="mt-4 h-8 w-20 rounded bg-neutral-1000-a05" />
      <div className="mt-2 h-3 w-16 rounded bg-neutral-1000-a05" />
      {chart ? (
        <div className="mt-4 h-[74px] rounded bg-neutral-1000-a05" />
      ) : (
        <div className="mt-4 h-1.5 rounded-full bg-neutral-1000-a05" />
      )}
    </div>
  );
}

function ActionTitle({ action }: { action: OpsTalentActionDefinition }) {
  return (
    <div className="flex min-h-5 items-center gap-1.5 text-sm text-neutral-primary">
      <span>{action.label}</span>
      {action.trackingSince ? (
        <span className="text-[10px] tabular-nums text-neutral-soft">
          {action.trackingSince}
        </span>
      ) : null}
    </div>
  );
}

function ActionErrorCard({ action }: { action: OpsTalentActionDefinition }) {
  return (
    <div className={cx(opsTheme.panel, "p-4")}>
      <ActionTitle action={action} />
      <div className="mt-4 text-sm text-critical">불러오기 실패</div>
    </div>
  );
}

function SummaryActionCard({
  action,
  query,
}: {
  action: OpsTalentActionDefinition;
  query: QueryState;
}) {
  if (query.isPending && !query.data) return <ActionCardSkeleton />;
  if (query.isError || !query.data) {
    return <ActionErrorCard action={action} />;
  }

  const metric = query.data.items.find((item) => item.actionId === action.id);
  const percentage = metric?.percentage ?? 0;
  const userCount = metric?.userCount ?? 0;
  return (
    <article className={cx(opsTheme.panel, "p-4")}>
      <ActionTitle action={action} />
      <div className="mt-3 text-[28px] font-semibold tracking-[-0.04em] text-neutral-primary tabular-nums">
        {formatPercentage(percentage)}
      </div>
      <div className="mt-1 text-xs tabular-nums text-neutral-muted">
        {userCount.toLocaleString()} / {query.data.cohortTotal.toLocaleString()}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-1000-a05">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
      </div>
    </article>
  );
}

function TrendSparkline({ points }: { points: TrendPoint[] }) {
  const width = 260;
  const height = 74;
  const padding = 4;
  const comparable = points
    .map((point, index) => ({ ...point, index }))
    .filter((point) => point.cohortTotal > 0);
  if (comparable.length === 0) {
    return <div className="h-[74px] rounded bg-neutral-1000-a05" />;
  }

  const percentages = comparable.map((point) => point.percentage);
  const rawMin = Math.min(...percentages);
  const rawMax = Math.max(...percentages);
  const spread = Math.max(rawMax - rawMin, 4);
  const min = Math.max(0, rawMin - spread * 0.2);
  const max = Math.min(100, rawMax + spread * 0.2);
  const yRange = Math.max(max - min, 1);
  const xRange = Math.max(points.length - 1, 1);
  const path = comparable
    .map((point, index) => {
      const x = padding + (point.index / xRange) * (width - padding * 2);
      const y =
        height -
        padding -
        ((point.percentage - min) / yRange) * (height - padding * 2);
      const previous = comparable[index - 1];
      const command =
        !previous || previous.index + 1 !== point.index ? "M" : "L";
      return `${command}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = comparable.at(-1)!;
  const latestX = padding + (latest.index / xRange) * (width - padding * 2);
  const latestY =
    height -
    padding -
    ((latest.percentage - min) / yRange) * (height - padding * 2);

  return (
    <svg
      aria-hidden="true"
      className="h-[74px] w-full overflow-visible"
      preserveAspectRatio="none"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-action)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={latestX}
        cy={latestY}
        fill="var(--color-action)"
        r="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function WeeklyActionCard({
  action,
  query,
}: {
  action: OpsTalentActionDefinition;
  query: QueryState;
}) {
  if (query.isPending && !query.data) return <ActionCardSkeleton chart />;
  if (query.isError || !query.data) {
    return <ActionErrorCard action={action} />;
  }

  const points = query.data.weeks.map((week) => {
    const metric = week.items.find((item) => item.actionId === action.id);
    return {
      cohortTotal: week.cohortTotal,
      percentage: metric?.percentage ?? 0,
      userCount: metric?.userCount ?? 0,
      weekLabel: formatWeekLabel(week.weekStart),
      weekStart: week.weekStart,
    } satisfies TrendPoint;
  });
  const comparablePoints = points.filter((point) => point.cohortTotal > 0);
  const latest = comparablePoints.at(-1) ?? null;
  const previous = comparablePoints.at(-2) ?? null;
  const delta =
    latest && previous ? latest.percentage - previous.percentage : null;

  return (
    <article className={cx(opsTheme.panel, "p-4")}>
      <ActionTitle action={action} />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <div className="text-[28px] font-semibold tracking-[-0.04em] text-neutral-primary tabular-nums">
          {latest ? formatPercentage(latest.percentage) : "-"}
        </div>
        <div
          className={cx(
            "text-xs font-medium tabular-nums",
            delta === null || Math.abs(delta) < 0.05
              ? "text-neutral-soft"
              : delta > 0
                ? "text-positive"
                : "text-critical"
          )}
        >
          {delta === null
            ? "-"
            : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}%p`}
        </div>
      </div>
      <div className="mt-1 text-xs tabular-nums text-neutral-muted">
        {latest
          ? `${latest.userCount.toLocaleString()} / ${latest.cohortTotal.toLocaleString()}`
          : "0 / 0"}
      </div>
      <div className="mt-3 h-[82px] w-full">
        <TrendSparkline points={points} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-soft tabular-nums">
        <span>{points[0]?.weekLabel ?? "-"}</span>
        <span>{points.at(-1)?.weekLabel ?? "-"}</span>
      </div>
    </article>
  );
}

export default function OpsTalentActionLogsPage() {
  const canFetch = useCanFetchInternal();
  const [view, setView] = useState<OpsTalentActionView>("summary");
  const [days, setDays] = useState(30);
  const [weeks, setWeeks] = useState(12);
  const queries = useOpsTalentActionLogs(canFetch, { days, view, weeks });
  const queryByGroup = useMemo(
    () =>
      new Map<OpsTalentActionSourceGroup, QueryState>(
        OPS_TALENT_ACTION_SOURCE_GROUPS.map((group, index) => [
          group,
          queries[index],
        ])
      ),
    [queries]
  );
  const cohortTotal = queries.find((query) => query.data)?.data?.cohortTotal;

  const filters = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-md bg-bg-weak p-1">
        <MuteButton
          size="sm"
          variant={view === "summary" ? "dark" : "transparent"}
          onClick={() => setView("summary")}
        >
          최근 가입자
        </MuteButton>
        <MuteButton
          size="sm"
          variant={view === "weekly" ? "dark" : "transparent"}
          onClick={() => setView("weekly")}
        >
          주간 추이
        </MuteButton>
      </div>

      {view === "summary" ? (
        <Select
          value={String(days)}
          onValueChange={(value) => setDays(Number(value))}
        >
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                최근 {option}일
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <>
          <Select
            value={String(weeks)}
            onValueChange={(value) => setWeeks(Number(value))}
          >
            <SelectTrigger size="sm" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEK_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}주
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className={opsTheme.badge}>가입 주차 · 완료 후 7일</span>
        </>
      )}

      <MuteButton
        aria-label="새로고침"
        size="sm"
        variant="transparent"
        onClick={() =>
          void Promise.all(queries.map((query) => query.refetch()))
        }
      >
        <RefreshCw
          className={cx(
            "h-3.5 w-3.5",
            queries.some((query) => query.isFetching) && "animate-spin"
          )}
        />
      </MuteButton>
    </div>
  );

  return (
    <DebuggingPageShell
      filters={filters}
      showContextLabel={false}
      showDescription={false}
      tab="actionLogs"
    >
      {view === "summary" ? (
        <div
          className={cx(
            opsTheme.panel,
            "flex items-center justify-between px-4 py-3"
          )}
        >
          <span className="text-sm text-neutral-muted">온보딩 완료</span>
          <span className="text-lg font-semibold text-neutral-primary tabular-nums">
            {cohortTotal === undefined
              ? "-"
              : `${cohortTotal.toLocaleString()}명`}
          </span>
        </div>
      ) : null}

      {OPS_TALENT_ACTION_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-neutral-muted">
            {section.label}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {section.actions.map((action) => {
              const query = queryByGroup.get(action.sourceGroup) ?? {
                isError: false,
                isPending: true,
              };
              return view === "summary" ? (
                <SummaryActionCard
                  key={action.id}
                  action={action}
                  query={query}
                />
              ) : (
                <WeeklyActionCard
                  key={action.id}
                  action={action}
                  query={query}
                />
              );
            })}
          </div>
        </section>
      ))}
    </DebuggingPageShell>
  );
}
