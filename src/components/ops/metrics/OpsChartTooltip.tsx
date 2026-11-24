import { useRouter } from "next/router";
import { createContext, useContext, type ReactNode } from "react";
import { ReferenceLine } from "recharts";
import {
  changeMovesChart,
  type OpsChangeChart,
  type OpsTrackedChange,
} from "@/lib/ops/updateMetrics";

// /ops 지표 그래프의 공통 툴팁과 변화 표시(2026-11-24 사용자 요청, 원칙은 src/lib/ops/updateMetrics.ts 7번).
// 그래프마다 그 그래프에 정말 영향을 주는 중요한 변화(추적 중인 OPS_TRACKED_CHANGES)만 배포일에 점선으로 표시한다. 모든 커밋을
// 넣지 않는다. 마우스를 올리면 날짜 바로 아래에 무엇을 바꿨는지 쉬운 말로 보이고, 점선 위 이름을 누르면
// /ops/update-metrics의 그 변화 줄이 열린다(거기서 지표와 PR로 간다). Provider가 없으면 숫자만 보인다.

type ChangeContextValue = {
  /** Tracked changes still being followed. */
  changes: OpsTrackedChange[];
  /** The interval of points that carry only `bucketStart`. */
  interval: "day" | "month" | "week";
};

const ChangeContext = createContext<ChangeContextValue | null>(null);

export function OpsChangeMarksProvider({
  changes,
  children,
  interval,
}: ChangeContextValue & { children: ReactNode }) {
  return <ChangeContext.Provider value={{ changes, interval }}>{children}</ChangeContext.Provider>;
}

type PointDates = {
  bucketStart?: string;
  cohortStart?: string;
  date?: string;
  endDay?: string;
  label?: unknown;
  startDay?: string;
};

function addDays(day: string, days: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function periodEnd(start: string, interval: ChangeContextValue["interval"]) {
  if (interval === "day") return start;
  if (interval === "week") return addDays(start, 6);
  const date = new Date(`${start}T00:00:00Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * The KST days a chart point covers. Update metric points carry both ends; DAU points are one `date`; WAU points
 * are the week from `cohortStart`; the other /ops/metrics points start at `bucketStart` and last one interval.
 */
function pointDays(point: PointDates, interval: ChangeContextValue["interval"]) {
  if (point.startDay && point.endDay) return { end: point.endDay, start: point.startDay };
  if (point.date) return { end: point.date, start: point.date };
  if (point.cohortStart) return { end: addDays(point.cohortStart, 6), start: point.cohortStart };
  if (point.bucketStart) return { end: periodEnd(point.bucketStart, interval), start: point.bucketStart };
  return null;
}

const shortDay = (day: string) => `${Number(day.slice(5, 7))}.${Number(day.slice(8, 10))}`;

/** Changes that move this chart and were deployed inside this point. */
function useChangesAt(chart: OpsChangeChart | undefined, point: PointDates) {
  const context = useContext(ChangeContext);
  if (!context || !chart) return { changes: [] as OpsTrackedChange[], spansDays: false };
  const days = pointDays(point, context.interval);
  if (!days) return { changes: [], spansDays: false };
  return {
    changes: context.changes.filter(
      (change) =>
        changeMovesChart(change, chart) && change.deployedOn >= days.start && change.deployedOn <= days.end
    ),
    spansDays: days.start !== days.end,
  };
}

/** Under the date: what changed, in plain words. Many changes at once show their names only. */
function ChangeList({ chart, point }: { chart?: OpsChangeChart; point: PointDates }) {
  const { changes, spansDays } = useChangesAt(chart, point);
  if (changes.length === 0) return null;
  const withDetail = changes.length <= 3;
  return (
    <ul className="mb-2 max-w-[340px] space-y-1.5 border-b border-popover-border pb-2">
      {changes.map((change) => (
        <li className="flex gap-1.5 leading-snug" key={change.key}>
          <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <span className="min-w-0">
            <span className="font-medium">
              {spansDays ? <span className="mr-1 tabular-nums opacity-60">{shortDay(change.deployedOn)}</span> : null}
              {change.title}
            </span>
            {withDetail ? <span className="block whitespace-normal opacity-75">{change.detail}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type OpsChartTooltipRow = { color: string; key: string; label: string; value: string };

/** A tooltip box: the point's date, the changes deployed then, then one row per series. */
export function OpsChartTooltipBox({
  chart,
  point,
  rows,
  title,
}: {
  chart?: OpsChangeChart;
  point: PointDates;
  rows: OpsChartTooltipRow[];
  title: string;
}) {
  return (
    <div className="rounded-popover border border-popover-border bg-popover p-3 text-xs text-popover-foreground shadow-(--shadow-popover)">
      <div className="mb-1.5 font-medium">{title}</div>
      <ChangeList chart={chart} point={point} />
      {rows.map((row) => (
        <div className="flex items-center justify-between gap-5 py-0.5" key={row.key}>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: row.color }} />
            {row.label}
          </span>
          <span className="tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

type RechartsPayloadItem = {
  color?: string;
  dataKey?: unknown;
  fill?: string;
  name?: unknown;
  payload?: Record<string, unknown>;
  stroke?: string;
  value?: unknown;
};

/**
 * Recharts tooltip content for charts whose series are plain bars and lines: `describe` names and formats each
 * series by its data key.
 */
export function OpsSeriesTooltip({
  active,
  chart,
  describe,
  payload,
}: {
  active?: boolean;
  chart?: OpsChangeChart;
  describe: (key: string, value: number) => { color?: string; label: string; value: string } | null;
  payload?: ReadonlyArray<RechartsPayloadItem>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const rows: OpsChartTooltipRow[] = [];
  for (const item of payload ?? []) {
    const key = String(item.dataKey ?? item.name ?? "");
    const value = Number(item.value);
    if (!key || item.value === null || item.value === undefined || !Number.isFinite(value)) continue;
    const row = describe(key, value);
    if (!row) continue;
    rows.push({
      color: row.color ?? item.color ?? item.stroke ?? item.fill ?? "currentColor",
      key,
      label: row.label,
      value: row.value,
    });
  }
  return (
    <OpsChartTooltipBox
      chart={chart}
      point={point as PointDates}
      rows={rows}
      title={String(point.fullLabel ?? point.label ?? "")}
    />
  );
}

export type OpsChangeMark = { changes: OpsTrackedChange[]; x: string };

/** Points (by X label) where a change that moves this chart was deployed. */
export function useOpsChangeMarks(chart: OpsChangeChart | undefined, points: PointDates[]): OpsChangeMark[] {
  const context = useContext(ChangeContext);
  if (!context || !chart) return [];
  const marks = new Map<string, OpsTrackedChange[]>();
  for (const change of context.changes) {
    if (!changeMovesChart(change, chart)) continue;
    const point = points.find((item) => {
      const days = pointDays(item, context.interval);
      return days && days.start <= change.deployedOn && change.deployedOn <= days.end;
    });
    if (!point || point.label === undefined) continue;
    const x = String(point.label);
    marks.set(x, [...(marks.get(x) ?? []), change]);
  }
  return [...marks.entries()].map(([x, changes]) => ({ changes, x }));
}

/** Opens the changes on /ops/update-metrics; there, the page expands them in place. */
export function useOpenChanges() {
  const router = useRouter();
  return (changes: OpsTrackedChange[]) =>
    void router.push(
      { pathname: "/ops/update-metrics", query: { change: changes.map((change) => change.key).join(",") } },
      undefined,
      { scroll: false, shallow: router.pathname === "/ops/update-metrics" }
    );
}

const LABEL_MAX_CHARS = 9;

/** The name over a mark's dashed line; clicking it opens the changes. */
function MarkLabel({
  changes,
  onOpen,
  viewBox,
}: {
  changes: OpsTrackedChange[];
  onOpen: (changes: OpsTrackedChange[]) => void;
  viewBox?: { x?: number; y?: number };
}) {
  const first = changes[0]?.title ?? "";
  const name = first.length > LABEL_MAX_CHARS ? `${first.slice(0, LABEL_MAX_CHARS)}…` : first;
  const text = changes.length > 1 ? `${name} 외 ${changes.length - 1}` : name;
  return (
    <g
      className="cursor-pointer"
      onClick={() => onOpen(changes)}
      role="link"
      style={{ pointerEvents: "all" }}
    >
      <title>{changes.map((change) => change.title).join(", ")}</title>
      <text
        fill="var(--color-neutral-muted)"
        fontSize={10}
        textDecoration="underline"
        x={(viewBox?.x ?? 0) + 4}
        y={(viewBox?.y ?? 0) + 10}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Recharts reads reference lines only as direct chart children, so marks are returned as an array of elements rather
 * than wrapped in a component.
 */
export function changeMarkLines(
  marks: OpsChangeMark[],
  onOpen: (changes: OpsTrackedChange[]) => void,
  options: { label?: boolean; yAxisId?: string } = {}
) {
  return marks.map((mark) => (
    <ReferenceLine
      ifOverflow="extendDomain"
      key={`change-${mark.x}`}
      label={options.label === false ? undefined : <MarkLabel changes={mark.changes} onOpen={onOpen} />}
      stroke="var(--color-neutral-600)"
      strokeDasharray="3 3"
      x={mark.x}
      {...(options.yAxisId ? { yAxisId: options.yAxisId } : {})}
    />
  ));
}
