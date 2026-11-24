import { useMemo, useState } from "react";
import { Info, LoaderCircle, RefreshCw } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cx } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes } from "@/components/ui/tab-boxes";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltips } from "@/components/ui/tooltip";
import { useOpsEmailActionMetrics } from "@/hooks/ops/useOpsEmailActionMetrics";
import {
  addCounts,
  EMAIL_ACTION_KIND_LABELS,
  emailActionDays,
  emailActionPoints,
  rate,
  summarizeEmailActions,
  type EmailActionCounts,
  type EmailActionKind,
  type EmailActionPoint,
} from "@/lib/ops/emailActionMetrics";

// Validated with the dataviz palette checks (light and dark): button vs no-button emails, then the three actions.
const COLORS =
  "[--ea-choice:#2a78d6] [--ea-plain:#d96b28] [--ea-reply:#1baf7a] [--ea-chat:#6250d6] [--ea-opportunity:#eda100] " +
  "dark:[--ea-choice:#3987e5] dark:[--ea-plain:#d95926] dark:[--ea-reply:#199e70] dark:[--ea-chat:#9085e9] dark:[--ea-opportunity:#c98500]";

const RANGE_ITEMS = [
  { label: "28일", value: "28" },
  { label: "56일", value: "56" },
  { label: "90일", value: "90" },
] as const;
const GRAIN_ITEMS = [
  { label: "7일 합산", value: "rolling" },
  { label: "일별", value: "daily" },
] as const;

type SeriesKey = "all" | "choice" | "plain" | "emailReply" | "chat" | "opportunity";
type Series = { color: string; key: SeriesKey; label: string };

const OVERALL: Series[] = [{ color: "var(--color-neutral-900)", key: "all", label: "전체 메일" }];
const BY_BUTTON: Series[] = [
  { color: "var(--ea-choice)", key: "choice", label: "버튼 메일" },
  { color: "var(--ea-plain)", key: "plain", label: "버튼 없는 메일" },
];
const BY_ACTION: Series[] = [
  { color: "var(--ea-reply)", key: "emailReply", label: "이메일 답장" },
  { color: "var(--ea-chat)", key: "chat", label: "채팅" },
  { color: "var(--ea-opportunity)", key: "opportunity", label: "기회 반응" },
];

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "var(--popover-border-width) solid var(--color-popover-border)",
  borderRadius: "var(--radius-popover)",
  boxShadow: "var(--shadow-popover)",
  color: "var(--color-popover-foreground)",
  fontSize: "12px",
  padding: "8px 10px",
};

const percent = (value: number | null, digits = 1) =>
  value === null ? "-" : `${(value * 100).toFixed(digits)}%`;
const count = (value: number) => value.toLocaleString("ko-KR");
const fullDate = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

function pointCounts(point: EmailActionPoint, key: SeriesKey) {
  const base = key === "choice" ? point.counts.choice : key === "plain" ? point.counts.plain : point.counts.all;
  const part =
    key === "emailReply" ? base.emailReply : key === "chat" ? base.chat : key === "opportunity" ? base.opportunity : base.acted;
  return { part, whole: base.emails };
}

function Title({ description, title }: { description: string; title: string }) {
  return (
    <div className="flex items-center gap-1">
      <h3 className="text-sm font-semibold text-neutral-primary">{title}</h3>
      <Tooltips side="top" text={description}>
        <MuteButton aria-label={`${title} 설명`} className="-my-1" size="sm" variant="transparent">
          <Info className="h-3 w-3" aria-hidden />
        </MuteButton>
      </Tooltips>
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {series.map((item) => (
        <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-muted" key={item.key}>
          <span aria-hidden className="h-[2px] w-3 rounded-full" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  series,
  volume,
}: {
  active?: boolean;
  payload?: Array<{ payload?: EmailActionPoint }>;
  series: Series[];
  volume?: boolean;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div style={tooltipStyle}>
      <div className="mb-1.5 font-medium">
        {fullDate(point.day)}
        {point.pending ? <span className="ml-1.5 font-normal text-neutral-muted">· 집계 중</span> : null}
      </div>
      <div className="flex flex-col gap-1">
        {series.map((item) => {
          const { part, whole } = pointCounts(point, item.key);
          return (
            <div className="flex items-center justify-between gap-6" key={item.key}>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
              <span className="tabular-nums">
                {volume ? (
                  `${count(whole)}통`
                ) : (
                  <>
                    {percent(rate(part, whole))}
                    <span className="ml-1.5 text-neutral-muted">
                      {count(part)}/{count(whole)}
                    </span>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Round-percent ticks from 0 up to just above the highest value. */
function percentTicks(points: EmailActionPoint[], series: Series[]) {
  const max = Math.max(0, ...points.flatMap((point) => series.map((item) => point[item.key] ?? 0)));
  const step = max <= 0.08 ? 0.02 : max <= 0.2 ? 0.05 : max <= 0.4 ? 0.1 : 0.2;
  const top = Math.min(1, Math.max(step * 2, Math.ceil((max * 1.08) / step) * step));
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => Number((index * step).toFixed(4)));
}

/**
 * Recharts reads reference marks only as direct chart children, so these are returned as an array of elements
 * rather than wrapped in a component.
 */
function markers({ firstChoiceLabel, pending }: { firstChoiceLabel: string | null; pending: [string, string] | null }) {
  return [
    pending ? (
      <ReferenceArea
        fill="var(--color-neutral-1000)"
        fillOpacity={0.05}
        key="pending"
        label={{ fill: "var(--color-neutral-soft)", fontSize: 10, position: "insideTop", value: "집계 중" }}
        x1={pending[0]}
        x2={pending[1]}
        yAxisId="rate"
      />
    ) : null,
    firstChoiceLabel ? (
      <ReferenceLine
        key="first-choice"
        label={{ fill: "var(--color-neutral-muted)", fontSize: 10, position: "insideTopLeft", value: "버튼 시작" }}
        stroke="var(--color-neutral-600)"
        strokeDasharray="3 3"
        x={firstChoiceLabel}
        yAxisId="rate"
      />
    ) : null,
  ];
}

function RateChart({
  description,
  emptyText = "표시할 메일이 없습니다",
  firstChoiceLabel,
  pending,
  points,
  series,
  title,
}: {
  description: string;
  emptyText?: string;
  firstChoiceLabel: string | null;
  pending: [string, string] | null;
  points: EmailActionPoint[];
  series: Series[];
  title: string;
}) {
  const ticks = percentTicks(points, series);
  const hasValues = points.some((point) => series.some((item) => point[item.key] !== null));
  return (
    <section className="min-w-0">
      <div className="flex min-h-8 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Title description={description} title={title} />
        <Legend series={series} />
      </div>
      <div className="relative mt-2 h-[240px] w-full">
        {hasValues ? null : (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-[13px] text-neutral-muted">
            {emptyText}
          </div>
        )}
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={points} margin={{ left: 0, right: 8, top: 14 }}>
            <CartesianGrid stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)" vertical={false} />
            <XAxis axisLine={false} dataKey="label" fontSize={11} minTickGap={24} tick={{ fill: "var(--color-neutral-soft)" }} tickLine={false} />
            <YAxis
              axisLine={false}
              domain={[0, ticks[ticks.length - 1]]}
              fontSize={11}
              tick={{ fill: "var(--color-neutral-soft)" }}
              tickFormatter={(value: number) => percent(value, 0)}
              ticks={ticks}
              tickLine={false}
              width={40}
              yAxisId="rate"
            />
            {markers({ firstChoiceLabel, pending })}
            <Tooltip
              content={<ChartTooltip series={series} />}
              cursor={{ stroke: "var(--color-neutral-1000-a10)", strokeWidth: 1 }}
            />
            {series.map((item) => (
              <Line
                activeDot={{ fill: item.color, r: 4, stroke: "var(--color-bg-default)", strokeWidth: 2 }}
                connectNulls={false}
                dataKey={item.key}
                dot={false}
                isAnimationActive={false}
                key={item.key}
                stroke={item.color}
                strokeWidth={2}
                type="monotone"
                yAxisId="rate"
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function VolumeChart({ points, rolling }: { points: EmailActionPoint[]; rolling: boolean }) {
  const data = points.map((point) => ({ ...point, choiceEmails: point.counts.choice.emails, plainEmails: point.counts.plain.emails }));
  return (
    <section className="min-w-0">
      <div className="flex min-h-8 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Title
          description={rolling ? "그날까지 7일 동안 Harper가 보낸 메일 수입니다." : "그날 Harper가 보낸 메일 수입니다."}
          title="보낸 메일"
        />
        <Legend series={BY_BUTTON} />
      </div>
      <div className="mt-2 h-[240px] w-full">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={data} margin={{ left: 0, right: 8, top: 14 }}>
            <CartesianGrid stroke="color-mix(in srgb, var(--color-neutral-1000) 6%, transparent)" vertical={false} />
            <XAxis axisLine={false} dataKey="label" fontSize={11} minTickGap={24} tick={{ fill: "var(--color-neutral-soft)" }} tickLine={false} />
            <YAxis axisLine={false} fontSize={11} tick={{ fill: "var(--color-neutral-soft)" }} tickFormatter={count} tickLine={false} width={40} />
            <Tooltip content={<ChartTooltip series={BY_BUTTON} volume />} cursor={{ fill: "var(--color-neutral-1000-a05)" }} />
            <Bar dataKey="plainEmails" fill="var(--ea-plain)" isAnimationActive={false} maxBarSize={14} stackId="emails" stroke="var(--color-bg-default)" strokeWidth={1} />
            <Bar dataKey="choiceEmails" fill="var(--ea-choice)" isAnimationActive={false} maxBarSize={14} radius={[2, 2, 0, 0]} stackId="emails" stroke="var(--color-bg-default)" strokeWidth={1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Stat({
  delta,
  label,
  note,
  value,
}: {
  /** A change shown in green when it went up, red when it went down. */
  delta?: number | null;
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t border-neutral-1000-a10 pt-3">
      <div className="text-[12px] text-neutral-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-medium leading-none tracking-[-0.02em] text-neutral-primary tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] text-neutral-muted tabular-nums">
        {note}
        {delta === null || delta === undefined ? null : (
          <span className={cx("ml-1.5", delta > 0 ? "text-positive" : delta < 0 ? "text-critical" : "")}>
            {diffText(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function pointDiff(after: number | null, before: number | null) {
  if (after === null || before === null) return null;
  return after - before;
}
const diffText = (diff: number | null) =>
  diff === null ? "" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${(Math.abs(diff) * 100).toFixed(1)}%p`;

function BreakdownTable({ rows, since }: { rows: Array<{ counts: EmailActionCounts; label: string; total?: boolean }>; since: string }) {
  return (
    <section className="min-w-0">
      <Title
        description={`${since}부터 72시간이 지난 메일만 셉니다. 한 메일 뒤에 여러 행동을 했으면 각 칸에 모두 셉니다.`}
        title="메일 종류별"
      />
      <div className="mt-2 overflow-x-auto">
        <Table className="min-w-[640px] text-[13px]">
          <TableHeader>
            <TableRow>
              <TableHead>메일</TableHead>
              <TableHead className="text-right">보낸 메일</TableHead>
              <TableHead className="text-right">행동 비율</TableHead>
              <TableHead className="text-right">이메일 답장</TableHead>
              <TableHead className="text-right">채팅</TableHead>
              <TableHead className="text-right">기회 반응</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ counts, label, total }) => (
              <TableRow className={cx(total && "font-medium")} key={label}>
                <TableCell className="text-neutral-primary">{label}</TableCell>
                <TableCell className="text-right tabular-nums">{count(counts.emails)}</TableCell>
                <TableCell className="text-right tabular-nums text-neutral-primary" title={`${count(counts.acted)} / ${count(counts.emails)}`}>
                  {percent(rate(counts.acted, counts.emails))}
                </TableCell>
                <TableCell className="text-right tabular-nums text-neutral-muted">{percent(rate(counts.emailReply, counts.emails))}</TableCell>
                <TableCell className="text-right tabular-nums text-neutral-muted">{percent(rate(counts.chat, counts.emails))}</TableCell>
                <TableCell className="text-right tabular-nums text-neutral-muted">{percent(rate(counts.opportunity, counts.emails))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default function OpsEmailActionMetrics({
  enabled,
  excludedEmails,
}: {
  enabled: boolean;
  excludedEmails: string[];
}) {
  const [range, setRange] = useState<(typeof RANGE_ITEMS)[number]["value"]>("56");
  const [grain, setGrain] = useState<(typeof GRAIN_ITEMS)[number]["value"]>("rolling");
  const query = useOpsEmailActionMetrics(enabled, { days: Number(range), excludedEmails });
  const days = useMemo(() => (query.data ? emailActionDays(query.data) : []), [query.data]);
  const points = useMemo(() => emailActionPoints(days, grain === "rolling"), [days, grain]);
  const summary = useMemo(() => summarizeEmailActions(days), [days]);

  const firstChoiceLabel = summary.firstChoiceDay
    ? points.find((point) => point.day === summary.firstChoiceDay)?.label ?? null
    : null;
  const pendingPoints = points.filter((point) => point.pending);
  const pending: [string, string] | null = pendingPoints.length
    ? [pendingPoints[0].label, pendingPoints[pendingPoints.length - 1].label]
    : null;

  const recentRate = summary.recent ? rate(summary.recent.counts.acted, summary.recent.counts.emails) : null;
  const previousRate = summary.previous ? rate(summary.previous.counts.acted, summary.previous.counts.emails) : null;
  const recentDiff = pointDiff(recentRate, previousRate);
  const since = summary.sinceChoice;
  const choice = since ? addCounts(since.choice_reply, since.choice_web) : null;
  const choiceRate = choice ? rate(choice.acted, choice.emails) : null;
  const plainRate = since ? rate(since.plain.acted, since.plain.emails) : null;
  const choiceDiff = pointDiff(choiceRate, plainRate);
  const sinceTotal = since && choice ? addCounts(choice, since.plain) : null;
  const tableRows = since && sinceTotal
    ? [
        ...(["choice_reply", "choice_web", "plain"] as EmailActionKind[]).map((kind) => ({
          counts: since[kind],
          label: EMAIL_ACTION_KIND_LABELS[kind],
        })),
        { counts: sinceTotal, label: "전체", total: true },
      ]
    : summary.recent
      ? [{ counts: summary.recent.counts, label: "전체 (최근 7일)", total: true }]
      : [];

  return (
    <section className={cx("mt-12 border-t border-neutral-1000-a10 pt-6", COLORS)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="font-hedvig text-[1.5rem] leading-none tracking-[-0.04em] text-neutral-primary">메일 받은 뒤 행동</h2>
          <p className="mt-2 max-w-[640px] text-sm text-neutral-muted">
            Harper가 보낸 메일 한 통마다, 받은 사람이 72시간 안에 이메일 답장·채팅·기회 반응 중 하나라도 했는지 셉니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TabBoxes
            activeValue={grain}
            aria-label="집계 단위"
            className="w-auto"
            items={GRAIN_ITEMS}
            onValueChange={setGrain}
            size="xs"
          />
          <TabBoxes
            activeValue={range}
            aria-label="기간"
            className="w-auto"
            items={RANGE_ITEMS}
            onValueChange={setRange}
            size="xs"
          />
          <MuteButton
            aria-label="메일 행동 지표 다시 불러오기"
            disabled={!enabled || query.isFetching}
            onClick={() => void query.refetch()}
            variant="transparent"
          >
            <RefreshCw className={cx("h-4 w-4", query.isFetching && "animate-spin")} />
          </MuteButton>
        </div>
      </div>

      {query.data && query.error instanceof Error ? (
        <div className="mt-4 text-sm text-critical">
          다시 불러오지 못해 이전 숫자를 보여 줍니다: {query.error.message}
        </div>
      ) : null}
      {query.data ? (
        <div className={cx("transition-opacity", query.isFetching && "opacity-60")}>
          <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
            <Stat
              label="행동 비율 · 최근 7일"
              delta={recentDiff}
              note={
                summary.recent
                  ? `${fullDate(summary.recent.from)}–${fullDate(summary.recent.to)} · 이전 7일 ${percent(previousRate)}`
                  : "72시간이 지난 메일이 아직 없습니다"
              }
              value={percent(recentRate)}
            />
            <Stat
              label="버튼 메일 행동 비율"
              delta={choiceDiff}
              note={since ? `버튼 없는 메일 ${percent(plainRate)}` : "선택지 버튼 메일을 보내기 전입니다"}
              value={percent(choiceRate)}
            />
            <Stat
              label="버튼이 들어간 메일"
              note={since && sinceTotal ? `${fullDate(summary.firstChoiceDay ?? "")}부터 ${count(sinceTotal.emails)}통 중 ${count(choice?.emails ?? 0)}통` : "선택지 버튼 메일을 보내기 전입니다"}
              value={sinceTotal ? percent(rate(choice?.emails ?? 0, sinceTotal.emails)) : "-"}
            />
            <Stat
              label="웹 채팅으로 연 선택지"
              note={
                since
                  ? `웹으로 열리는 버튼 메일 ${count(since.choice_web.emails)}통 · 답장 창은 셀 수 없음`
                  : "선택지 버튼 메일을 보내기 전입니다"
              }
              value={since ? `${count(summary.webOpensSinceChoice)}회` : "-"}
            />
            <Stat
              label="안 본 답장 메일"
              note={
                query.data.unseenReplies
                  ? `최근 ${range}일 · 안 본 답장 ${count(query.data.unseenReplies.reviewed)}건 검토`
                  : "집계 전입니다"
              }
              value={query.data.unseenReplies ? `${count(query.data.unseenReplies.sent)}통` : "-"}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
            <RateChart
              description="보낸 메일 중 72시간 안에 이메일 답장·채팅·기회 반응 중 하나라도 이어진 비율입니다. 72시간이 지나지 않은 메일은 집계 중으로 표시하고, 시간이 지나며 값이 오를 수 있습니다."
              firstChoiceLabel={firstChoiceLabel}
              pending={pending}
              points={points}
              series={OVERALL}
              title="행동 비율"
            />
            <RateChart
              description="선택지 버튼이 들어간 메일과 없는 메일의 행동 비율을 첫 버튼 메일을 보낸 날부터 나눠 봅니다."
              emptyText="선택지 버튼 메일을 보낸 날부터 나눠 보여 줍니다"
              firstChoiceLabel={firstChoiceLabel}
              pending={pending}
              points={points}
              series={BY_BUTTON}
              title="버튼 유무별 행동 비율"
            />
            <RateChart
              description="보낸 메일 중 72시간 안에 각 행동이 있었던 비율입니다. 한 메일 뒤에 여러 행동을 했으면 각각 셉니다. 채팅에는 채팅 버튼으로 보낸 답도 포함합니다."
              firstChoiceLabel={firstChoiceLabel}
              pending={pending}
              points={points}
              series={BY_ACTION}
              title="행동 종류별 비율"
            />
            <VolumeChart points={points} rolling={grain === "rolling"} />
          </div>

          {tableRows.length ? (
            <div className="mt-8">
              <BreakdownTable
                rows={tableRows}
                since={summary.firstChoiceDay ? fullDate(summary.firstChoiceDay) : summary.recent ? fullDate(summary.recent.from) : ""}
              />
            </div>
          ) : null}
        </div>
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
    </section>
  );
}
