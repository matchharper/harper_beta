import { Building2, GraduationCap } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { getSchoolDisplayName } from "@/lib/career/schoolDisplay";
import { cn } from "@/lib/utils";
import type {
  CompanyProfileFundingRound,
  CompanyProfileHeadcountMonth,
  CompanyProfileInvestor,
  CompanyProfileOrganization,
} from "@/lib/career/companyProfileTypes";

const DATA = "var(--color-action)";
const DATA_TEXT = "var(--color-action-strong)";
const INK = "var(--color-neutral-primary)";
const AXIS = "var(--color-neutral-soft)";

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function formatMonthLabel(month: string, locale: "ko" | "en") {
  const [year, value] = month.split("-").map(Number);
  if (!year || !value) return month;
  return locale === "ko"
    ? `${year}년 ${value}월`
    : new Date(Date.UTC(year, value - 1, 1)).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

/** A small headcount line for the opportunity's company facts. */
export function HeadcountSparkline({
  months,
  className,
}: {
  months: readonly CompanyProfileHeadcountMonth[];
  className?: string;
}) {
  const width = 88;
  const height = 22;
  if (months.length < 2) return null;
  const values = months.map((month) => month.members);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = 2 + (index * (width - 4)) / (values.length - 1);
      const y = height - 3 - ((value - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      className={className}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline
        fill="none"
        points={points}
        stroke={DATA}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}

function ChartTooltip({
  children,
  left,
  top,
}: {
  children: ReactNode;
  left: number | string;
  top: number;
}) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-surface-inverse px-2.5 py-2 text-[12px] leading-[1.55] text-on-inverse shadow-lg"
      style={{ left, top }}
    >
      {children}
    </div>
  );
}

/** Monthly 국민연금 headcount with hires and leaves on hover. */
export function HeadcountChart({
  locale,
  months,
}: {
  locale: "ko" | "en";
  months: readonly CompanyProfileHeadcountMonth[];
}) {
  const t = useCareerT();
  const gradientId = useId();
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const left = 8;
  const right = 52;
  const top = 26;
  const bottom = 146;
  const narrow = width < 460;
  // Small hires/leaves bars under the line, when 국민연금 reported them.
  const hasFlow = months.some(
    (month) => month.hires !== null || month.leaves !== null
  );
  const flowTop = bottom + 12;
  const flowBottom = bottom + 42;
  const height = hasFlow ? flowBottom + 30 : 176;
  const flowMax = Math.max(
    1,
    ...months.map((month) => Math.max(month.hires ?? 0, month.leaves ?? 0))
  );
  if (months.length < 2) return null;
  const values = months.map((month) => month.members);
  const vmin = Math.max(0, Math.floor((Math.min(...values) * 0.92) / 10) * 10);
  const vmax = Math.ceil((Math.max(...values) * 1.04) / 10) * 10 || 10;
  const band = width > 0 ? (width - left - right) / months.length : 0;
  const cx = (index: number) => left + band * (index + 0.5);
  const cy = (value: number) =>
    bottom - ((value - vmin) / Math.max(1, vmax - vmin)) * (bottom - top);
  const points = months.map((month, index) => [cx(index), cy(month.members)]);
  const line = `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`;
  const last = points[points.length - 1];
  const first = points[0];
  const activeMonth = active === null ? null : months[active];

  return (
    <div
      ref={boxRef}
      className="relative rounded-2xl bg-neutral-1000-a05/70 px-2.5 pb-1 pt-2.5"
      onMouseLeave={() => setActive(null)}
    >
      {width > 0 ? (
        <svg
          className="block w-full overflow-visible"
          height={height}
          role="img"
          aria-label={t("career.company.page.headcount_chart", "월별 인원")}
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={DATA} stopOpacity={0.14} />
              <stop offset="1" stopColor={DATA} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${line} L${last[0].toFixed(1)} ${bottom} L${first[0].toFixed(1)} ${bottom} Z`}
            fill={`url(#${gradientId})`}
          />
          <path
            d={line}
            fill="none"
            stroke={DATA}
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <line
            stroke="var(--color-neutral-1000-a10)"
            x1={left}
            x2={width - right}
            y1={bottom}
            y2={bottom}
          />
          <circle cx={first[0]} cy={first[1]} fill={DATA} r={2.6} />
          <text fill={AXIS} fontSize={11} x={first[0] - 2} y={first[1] - 10}>
            {t("career.company.page.people_count", "{count}명", {
              values: { count: months[0].members.toLocaleString() },
            })}
          </text>
          <circle cx={last[0]} cy={last[1]} fill={DATA} r={3.2} />
          <text
            fill={INK}
            fontSize={12}
            fontWeight={650}
            x={last[0] + 7}
            y={last[1] + 4}
          >
            {t("career.company.page.people_count", "{count}명", {
              values: {
                count: months[months.length - 1].members.toLocaleString(),
              },
            })}
          </text>
          {hasFlow ? (
            <g aria-hidden>
              <line
                stroke="var(--color-neutral-1000-a10)"
                x1={left}
                x2={width - right}
                y1={flowBottom}
                y2={flowBottom}
              />
              {months.map((month, index) => {
                const barWidth = Math.max(2, Math.min(6, band * 0.24));
                const barHeight = (count: number | null) =>
                  count
                    ? Math.max(1.5, (count / flowMax) * (flowBottom - flowTop))
                    : 0;
                const hires = barHeight(month.hires);
                const leaves = barHeight(month.leaves);
                return (
                  <g key={month.month}>
                    <rect
                      fill="var(--color-positive)"
                      fillOpacity={
                        active === null || active === index ? 0.85 : 0.4
                      }
                      height={hires}
                      rx={1}
                      width={barWidth}
                      x={cx(index) - barWidth - 0.75}
                      y={flowBottom - hires}
                    />
                    <rect
                      fill="var(--color-critical)"
                      fillOpacity={
                        active === null || active === index ? 0.75 : 0.35
                      }
                      height={leaves}
                      rx={1}
                      width={barWidth}
                      x={cx(index) + 0.75}
                      y={flowBottom - leaves}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}
          {months.map((month, index) => {
            const [year, value] = month.month.split("-").map(Number);
            const edge = index === 0 || index === months.length - 1;
            if (narrow && index % 2 === 1 && !edge) return null;
            const label =
              locale === "ko"
                ? index === 0 || value === 1
                  ? `${String(year).slice(2)}.${value}`
                  : `${value}월`
                : index === 0 || value === 1
                  ? `${value}/${String(year).slice(2)}`
                  : String(value);
            return (
              <text
                key={month.month}
                fill={AXIS}
                fontSize={10.5}
                textAnchor={
                  index === 0
                    ? "start"
                    : index === months.length - 1
                      ? "end"
                      : "middle"
                }
                x={
                  index === 0
                    ? cx(index) - band / 2 + 2
                    : index === months.length - 1
                      ? cx(index) + band / 2
                      : cx(index)
                }
                y={height - 6}
              >
                {label}
              </text>
            );
          })}
          {active !== null ? (
            <line
              stroke={INK}
              strokeOpacity={0.18}
              x1={cx(active)}
              x2={cx(active)}
              y1={top - 14}
              y2={hasFlow ? flowBottom : bottom}
            />
          ) : null}
          {months.map((month, index) => (
            <rect
              key={month.month}
              fill="transparent"
              height={height - 18}
              width={band}
              x={cx(index) - band / 2}
              y={0}
              onMouseEnter={() => setActive(index)}
              onClick={() => setActive(index)}
            />
          ))}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
      {hasFlow ? (
        <div className="flex gap-3 px-1 pb-1.5 text-[11px] text-neutral-muted">
          <span className="inline-flex items-center gap-1">
            <i className="size-2 rounded-[2px] bg-positive" />
            {t("career.company.page.legend_hires", "입사")}
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="size-2 rounded-[2px] bg-critical" />
            {t("career.company.page.legend_leaves", "퇴사")}
          </span>
        </div>
      ) : null}
      {activeMonth && active !== null ? (
        <ChartTooltip left={10 + cx(active)} top={cy(activeMonth.members)}>
          <b className="font-semibold">
            {formatMonthLabel(activeMonth.month, locale)}
          </b>
          <br />
          {t("career.company.page.tooltip_members", "인원 {count}명", {
            values: { count: activeMonth.members.toLocaleString() },
          })}
          {activeMonth.hires !== null && activeMonth.leaves !== null ? (
            <>
              <br />
              {t(
                "career.company.page.tooltip_flow",
                "입사 {hires}명, 퇴사 {leaves}명",
                {
                  values: {
                    hires: activeMonth.hires,
                    leaves: activeMonth.leaves,
                  },
                }
              )}
            </>
          ) : null}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

/** Funding rounds on one line; only the latest carries an amount. */
export function FundingRoundLane({
  lastAmount,
  rounds,
}: {
  lastAmount: string | null;
  rounds: readonly CompanyProfileFundingRound[];
}) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const height = 70;
  const y = 36;
  const narrow = width < 460;
  const pad = narrow ? 16 : 22;
  const toMonth = (date: string) => {
    const [year, month] = date.split("-").map(Number);
    return year * 12 + (month - 1);
  };
  const m0 = toMonth(rounds[0]?.date ?? "2000-01");
  const m1 = toMonth(rounds[rounds.length - 1]?.date ?? "2000-01");
  // Rounds close in time still get room for their names.
  const positions = rounds.map((round, index) =>
    m1 > m0
      ? pad +
        ((toMonth(round.date) - m0) / (m1 - m0)) * (width - pad * 2) * 0.6 +
        (index / Math.max(1, rounds.length - 1)) * (width - pad * 2) * 0.4
      : pad + (index / Math.max(1, rounds.length - 1)) * (width - pad * 2)
  );
  const short = (stage: string) =>
    narrow ? stage.replace(/^Series /, "") : stage;

  return (
    <div
      ref={boxRef}
      className="rounded-2xl bg-neutral-1000-a05/70 px-2.5 pb-0.5 pt-1.5"
    >
      {width > 0 && rounds.length > 1 ? (
        <svg
          className="block w-full overflow-visible"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <line
            stroke={DATA}
            strokeOpacity={0.3}
            strokeWidth={2}
            x1={positions[0]}
            x2={positions[positions.length - 1]}
            y1={y}
            y2={y}
          />
          {rounds.map((round, index) => {
            const last = index === rounds.length - 1;
            const x = positions[index];
            const anchor = index === 0 ? "start" : last ? "end" : "middle";
            const tx = index === 0 ? x - 6 : last ? x + 6 : x;
            return (
              <g key={`${round.date}-${round.stage}`}>
                <circle
                  cx={x}
                  cy={y}
                  fill={last ? DATA : "white"}
                  r={last ? 6 : 4.5}
                  stroke={last ? "white" : DATA}
                  strokeWidth={last ? 2 : 1.6}
                />
                <text
                  fill={INK}
                  fontSize={11.5}
                  fontWeight={600}
                  textAnchor={anchor}
                  x={tx}
                  y={y - 13}
                >
                  {short(round.stage)}
                  {last && lastAmount ? (
                    <tspan fill={DATA_TEXT}>{` ${lastAmount}`}</tspan>
                  ) : null}
                </text>
                <text
                  fill={AXIS}
                  fontSize={10.5}
                  textAnchor={anchor}
                  x={tx}
                  y={y + 21}
                >
                  {`${round.date.slice(2, 4)}.${round.date.slice(5, 7)}`}
                </text>
              </g>
            );
          })}
        </svg>
      ) : (
        <div style={{ height }} />
      )}
    </div>
  );
}

export function OrganizationLogo({
  logoUrl,
  name,
  school = false,
  size = 22,
}: {
  logoUrl: string | null;
  name: string;
  school?: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const Icon = school ? GraduationCap : Building2;
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default"
      style={{ height: size, width: size }}
    >
      {logoUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={name}
          className="size-full object-contain p-[2px]"
          loading="lazy"
          src={logoUrl}
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon aria-hidden className="size-3 text-neutral-soft" />
      )}
    </span>
  );
}

export function InvestorList({
  investors,
}: {
  investors: readonly CompanyProfileInvestor[];
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {investors.map((investor) => (
        <div
          key={investor.name}
          className="flex min-w-0 items-center gap-2.5 py-1.5"
        >
          <OrganizationLogo
            logoUrl={investor.logoUrl}
            name={investor.name}
            size={28}
          />
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-neutral-primary">
              {investor.name}
            </div>
            {investor.round ? (
              <div className="truncate text-[12px] text-neutral-soft">
                {investor.round}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

type FlowRow = {
  count: number;
  logoUrl: string | null;
  mine?: boolean;
  muted?: boolean;
  name: string;
  tooltip: string;
};

/** Where current members came from and where people who left went, around this company. */
export function PeopleFlow({
  companyName,
  inbound,
  outbound,
  inboundTitle,
  outboundTitle,
}: {
  companyName: string;
  inbound: FlowRow[];
  outbound: FlowRow[];
  inboundTitle: string;
  outboundTitle: string;
}) {
  const [boxRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{
    side: "in" | "out";
    index: number;
  } | null>(null);
  const rowHeight = 32;
  const rows = Math.max(inbound.length, outbound.length);
  const height = rows * rowHeight;
  const sum = (list: FlowRow[]) =>
    list.reduce((total, row) => total + row.count, 0);
  const inTotal = sum(inbound);
  const outTotal = sum(outbound);
  const maxNode = Math.max(
    1,
    ...[...inbound, ...outbound]
      .filter((row) => !row.muted)
      .map((row) => row.count)
  );
  const nodeWidth = 6;
  const centerHeight = height * 0.72;
  const unit = centerHeight / Math.max(1, inTotal, outTotal);
  const centerTop = (height - inTotal * unit) / 2;
  const centerX = width / 2 - nodeWidth / 2;
  const nodeHeight = (count: number) =>
    Math.max(3, Math.min(rowHeight - 7, (count / maxNode) * (rowHeight - 9)));
  const band = (
    x1: number,
    y1a: number,
    y1b: number,
    x2: number,
    y2a: number,
    y2b: number
  ) => {
    const mid = (x1 + x2) / 2;
    return `M${x1} ${y1a} C${mid} ${y1a} ${mid} ${y2a} ${x2} ${y2a} L${x2} ${y2b} C${mid} ${y2b} ${mid} ${y1b} ${x1} ${y1b} Z`;
  };

  const offsets = (list: FlowRow[], start: number) =>
    list.map((_, index) =>
      list
        .slice(0, index)
        .reduce((total, row) => total + row.count * unit, start)
    );
  const inOffsets = offsets(inbound, centerTop);
  const outOffsets = offsets(
    outbound,
    centerTop + ((inTotal - outTotal) * unit) / 2
  );
  const hovered = hover
    ? (hover.side === "in" ? inbound : outbound)[hover.index]
    : null;

  const label = (row: FlowRow, side: "in" | "out", index: number) => (
    <div
      key={`${side}-${row.name}`}
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-[12.5px]",
        side === "in" ? "justify-end text-right" : "justify-start",
        row.muted ? "text-neutral-soft" : "text-neutral-primary"
      )}
      style={{ height: rowHeight }}
      onMouseEnter={() => setHover({ side, index })}
      onMouseLeave={() => setHover(null)}
    >
      {side === "out" ? (
        <span className="shrink-0 text-[11px] tabular-nums text-neutral-soft">
          {row.count}
        </span>
      ) : null}
      {!row.muted ? (
        <OrganizationLogo logoUrl={row.logoUrl} name={row.name} size={18} />
      ) : null}
      <span
        className={cn(
          "min-w-0 truncate",
          row.mine && "font-semibold text-action-strong"
        )}
        title={row.name}
      >
        {row.name}
      </span>
      {side === "in" ? (
        <span className="shrink-0 text-[11px] tabular-nums text-neutral-soft">
          {row.count}
        </span>
      ) : null}
    </div>
  );

  return (
    <div className="relative rounded-2xl bg-neutral-1000-a05/70 px-2.5 pb-2 pt-3">
      <div className="mb-1 grid grid-cols-[minmax(0,1.4fr)_minmax(56px,0.7fr)_minmax(0,1.4fr)] sm:grid-cols-[minmax(0,1fr)_minmax(96px,1fr)_minmax(0,1fr)] gap-2 text-[11px] font-semibold">
        <span className="text-right text-action-strong">{inboundTitle}</span>
        <span className="truncate text-center text-[12px] text-neutral-primary">
          {companyName}
        </span>
        <span className="text-neutral-soft">{outboundTitle}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(56px,0.7fr)_minmax(0,1.4fr)] sm:grid-cols-[minmax(0,1fr)_minmax(96px,1fr)_minmax(0,1fr)] gap-2">
        <div>{inbound.map((row, index) => label(row, "in", index))}</div>
        <div ref={boxRef} className="min-w-0">
          {width > 0 ? (
            <svg
              className="block w-full overflow-visible"
              height={height}
              viewBox={`0 0 ${width} ${height}`}
            >
              {inbound.map((row, index) => {
                const h = nodeHeight(row.count);
                const yc = rowHeight * (index + 0.5);
                const ch = row.count * unit;
                const y = inOffsets[index];
                const active = hover?.side === "in" && hover.index === index;
                const color = row.muted ? "var(--color-neutral-400)" : DATA;
                const opacity = row.muted ? 0.4 : row.mine ? 0.72 : 0.18;
                return (
                  <g
                    key={row.name}
                    onMouseEnter={() => setHover({ side: "in", index })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <path
                      d={band(
                        nodeWidth,
                        yc - h / 2,
                        yc + h / 2,
                        centerX,
                        y,
                        y + ch
                      )}
                      fill={color}
                      fillOpacity={active ? opacity + 0.22 : opacity}
                    />
                    <rect
                      fill={color}
                      height={h}
                      rx={2}
                      width={nodeWidth}
                      x={0}
                      y={yc - h / 2}
                    />
                  </g>
                );
              })}
              <rect
                fill={INK}
                height={inTotal * unit}
                rx={2}
                width={nodeWidth}
                x={centerX}
                y={centerTop}
              />
              {outbound.map((row, index) => {
                const h = nodeHeight(row.count);
                const yc = rowHeight * (index + 0.5);
                const ch = row.count * unit;
                const y = outOffsets[index];
                const active = hover?.side === "out" && hover.index === index;
                const color = row.muted
                  ? "var(--color-neutral-400)"
                  : "var(--color-neutral-soft)";
                const opacity = row.muted ? 0.4 : row.mine ? 0.6 : 0.3;
                return (
                  <g
                    key={row.name}
                    onMouseEnter={() => setHover({ side: "out", index })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <path
                      d={band(
                        centerX + nodeWidth,
                        y,
                        y + ch,
                        width - nodeWidth,
                        yc - h / 2,
                        yc + h / 2
                      )}
                      fill={color}
                      fillOpacity={active ? opacity + 0.22 : opacity}
                    />
                    <rect
                      fill={color}
                      height={h}
                      rx={2}
                      width={nodeWidth}
                      x={width - nodeWidth}
                      y={yc - h / 2}
                    />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div style={{ height }} />
          )}
        </div>
        <div>{outbound.map((row, index) => label(row, "out", index))}</div>
      </div>
      {hovered && hover ? (
        <ChartTooltip left="50%" top={40 + rowHeight * hover.index}>
          {hovered.tooltip}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

export function OrganizationRanking({
  items,
  mineLabel,
  school = false,
  showLogo = true,
  total,
}: {
  items: readonly CompanyProfileOrganization[];
  mineLabel: string;
  school?: boolean;
  showLogo?: boolean;
  total: number;
}) {
  const { locale } = useMessages();
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="grid grid-cols-1 gap-x-7 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.name}
          className={cn(
            "grid items-center gap-2.5 py-[7px]",
            showLogo
              ? "grid-cols-[22px_minmax(0,1fr)_auto]"
              : "grid-cols-[minmax(0,1fr)_auto]"
          )}
        >
          {showLogo ? (
            <OrganizationLogo
              logoUrl={item.logoUrl}
              name={item.name}
              school={school}
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span className={cn("truncate", item.mine && "font-semibold")}>
                {school ? getSchoolDisplayName(item.name, locale) : item.name}
              </span>
              {item.mine ? (
                <span className="shrink-0 text-[11px] text-action-strong">
                  {mineLabel}
                </span>
              ) : null}
            </div>
            <div className="mt-[5px] h-1 overflow-hidden rounded-full bg-neutral-1000-a05">
              <i
                className="block h-full rounded-full"
                style={{
                  background: item.mine
                    ? DATA
                    : "color-mix(in srgb, var(--color-action) 28%, white)",
                  width: `${(item.count / max) * 100}%`,
                }}
              />
            </div>
          </div>
          <span className="text-right text-[12px] tabular-nums text-neutral-muted">
            {total > 0
              ? `${item.count.toLocaleString()} (${Math.round((item.count / total) * 100)}%)`
              : item.count.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
