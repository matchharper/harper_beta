import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DebuggingPageShell,
  useCanFetchInternal,
} from "@/components/ops/debugging/shared";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { useOpsCosts } from "@/hooks/ops/useOpsCosts";
import type {
  OpsCostProviderId,
  OpsCostProviderResult,
  OpsCostResponse,
  OpsCostSourceStatus,
  OpsCreditProviderResult,
} from "@/lib/ops/costTypes";

type Granularity = "daily" | "weekly";
type RangeDays = 7 | 30;
type CombinedProviderId = OpsCostProviderId | "deepseek";

type CostChartRow = {
  claude: number;
  deepseek: number;
  ec2: number;
  ec2Net: number;
  exa: number;
  grok: number;
  label: string;
  openai: number;
  period: string;
};

const PROVIDER_META: Record<
  CombinedProviderId,
  { color: string; shortLabel: string }
> = {
  claude: { color: "#c15f3c", shortLabel: "Claude" },
  deepseek: { color: "#7b61a8", shortLabel: "DeepSeek" },
  openai: { color: "#10a37f", shortLabel: "OpenAI" },
  grok: { color: "#56616f", shortLabel: "Grok" },
  exa: { color: "#3478f6", shortLabel: "Exa" },
  ec2: { color: "#e38b2c", shortLabel: "AWS EC2" },
};

const COST_PROVIDER_IDS: OpsCostProviderId[] = [
  "claude",
  "openai",
  "grok",
  "exa",
  "ec2",
];
const COMBINED_PROVIDER_IDS: CombinedProviderId[] = [
  "claude",
  "openai",
  "grok",
  "exa",
  "deepseek",
];

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function getDateRange(days: RangeDays) {
  const through = toDateOnly(new Date());
  return { from: addUtcDays(through, -(days - 1)), through };
}

function enumerateDates(from: string, through: string) {
  const dates: string[] = [];
  for (let date = from; date <= through; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

function formatShortDate(dateOnly: string) {
  return dateOnly.slice(5).replace("-", ".");
}

function formatDate(dateOnly: string) {
  return dateOnly.replaceAll("-", ".");
}

function formatMoney(amount: number, currency = "USD") {
  const maximumFractionDigits =
    Math.abs(amount) > 0 && Math.abs(amount) < 0.01 ? 4 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits,
      minimumFractionDigits: 2,
      style: "currency",
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(maximumFractionDigits)}`;
  }
}

function emptyCostRow(label: string, period: string): CostChartRow {
  return {
    claude: 0,
    deepseek: 0,
    ec2: 0,
    ec2Net: 0,
    exa: 0,
    grok: 0,
    label,
    openai: 0,
    period,
  };
}

function buildDailyRows(data: OpsCostResponse) {
  const providerAmounts = new Map(
    data.costs.map((provider) => [
      provider.id,
      new Map(provider.points.map((point) => [point.date, point.amount])),
    ])
  );
  const ec2Provider = data.costs.find((provider) => provider.id === "ec2");
  const ec2NetAmounts = new Map(
    ec2Provider?.netPoints?.map((point) => [point.date, point.amount]) ?? []
  );

  return enumerateDates(data.from, data.through).map((date) => {
    const row = emptyCostRow(formatShortDate(date), formatDate(date));
    for (const providerId of COST_PROVIDER_IDS) {
      row[providerId] = providerAmounts.get(providerId)?.get(date) ?? 0;
    }
    row.deepseek = 10;
    row.ec2Net = Math.max(0, ec2NetAmounts.get(date) ?? 0);
    return row;
  });
}

function getUtcMonday(dateOnly: string) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return toDateOnly(date);
}

function buildWeeklyRows(
  dailyRows: CostChartRow[],
  from: string,
  through: string
) {
  const rows = new Map<string, CostChartRow>();

  for (const dailyRow of dailyRows) {
    const date = dailyRow.period.replaceAll(".", "-");
    const weekStart = getUtcMonday(date);
    const displayStart = weekStart < from ? from : weekStart;
    const weekEnd = [addUtcDays(weekStart, 6), through].sort()[0];
    const row =
      rows.get(weekStart) ??
      emptyCostRow(
        `${formatShortDate(displayStart)}–${formatShortDate(weekEnd)}`,
        `${formatDate(displayStart)} – ${formatDate(weekEnd)}`
      );

    for (const providerId of COST_PROVIDER_IDS) {
      row[providerId] += dailyRow[providerId];
    }
    row.deepseek += dailyRow.deepseek;
    row.ec2Net += dailyRow.ec2Net;
    rows.set(weekStart, row);
  }

  return Array.from(rows.values());
}

function statusLabel(status: OpsCostSourceStatus) {
  if (status === "ok") return "연결됨";
  if (status === "not_configured") return "설정 필요";
  return "조회 실패";
}

function StatusIcon({ status }: { status: OpsCostSourceStatus }) {
  if (status === "ok") {
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
  if (status === "not_configured") {
    return <Settings2 className="h-3.5 w-3.5" />;
  }
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

function StatusBadge({ status }: { status: OpsCostSourceStatus }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
        status === "ok"
          ? "bg-positive-faded text-positive"
          : status === "not_configured"
            ? "bg-bg-weak text-neutral-soft"
            : "bg-critical-faded text-critical"
      )}
    >
      <StatusIcon status={status} />
      {statusLabel(status)}
    </span>
  );
}

const tooltipStyle = {
  background: "var(--color-bg-default)",
  border: 0,
  borderRadius: 6,
  boxShadow:
    "0 14px 40px color-mix(in srgb, var(--color-neutral-1000) 12%, transparent)",
  fontSize: 12,
} as const;

function CombinedCostChart({
  providers,
  rows,
}: {
  providers: OpsCostProviderResult[];
  rows: CostChartRow[];
}) {
  const connectedProviderIds = COMBINED_PROVIDER_IDS.filter(
    (providerId) =>
      providerId === "deepseek" ||
      providers.find((provider) => provider.id === providerId)?.status === "ok"
  );
  const providerTotals = new Map<CombinedProviderId, number>(
    COMBINED_PROVIDER_IDS.map((providerId) => [
      providerId,
      providerId === "deepseek"
        ? rows.reduce((sum, row) => sum + row.deepseek, 0)
        : (providers.find((provider) => provider.id === providerId)?.total ?? 0),
    ])
  );
  const total = COMBINED_PROVIDER_IDS.reduce(
    (sum, providerId) => sum + (providerTotals.get(providerId) ?? 0),
    0
  );

  return (
    <section className={cx(opsTheme.panel, "p-4 sm:p-5")}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-muted">
            Claude + OpenAI + Grok + Exa + DeepSeek
          </div>
          <div className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-neutral-primary">
            {formatMoney(total)}
          </div>
        </div>

        <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
          {COMBINED_PROVIDER_IDS.map((providerId) => {
            const provider = providers.find((item) => item.id === providerId);
            const isDeepSeek = providerId === "deepseek";
            const providerTotal = providerTotals.get(providerId) ?? 0;
            const isConnected = isDeepSeek || provider?.status === "ok";
            const share = total > 0 ? (providerTotal / total) * 100 : 0;
            return (
              <div
                key={providerId}
                className="flex min-w-[132px] items-center gap-2"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{
                    backgroundColor: PROVIDER_META[providerId].color,
                    opacity: isConnected ? 1 : 0.25,
                  }}
                />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-medium text-neutral-primary">
                      {PROVIDER_META[providerId].shortLabel}
                    </span>
                    <span className="text-[10px] tabular-nums text-neutral-soft">
                      {share.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs tabular-nums text-neutral-muted">
                    {isConnected
                      ? formatMoney(providerTotal)
                      : statusLabel(provider?.status ?? "not_configured")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {connectedProviderIds.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center text-sm text-neutral-soft">
          연결된 비용 데이터가 없습니다.
        </div>
      ) : (
        <div className="mt-5 h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
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
                minTickGap={20}
                tickLine={false}
                tick={{ fill: "var(--color-neutral-soft)" }}
              />
              <YAxis
                axisLine={false}
                fontSize={11}
                tickFormatter={(value) => formatMoney(Number(value))}
                tickLine={false}
                tick={{ fill: "var(--color-neutral-soft)" }}
                width={72}
              />
              <Tooltip
                cursor={{
                  fill: "color-mix(in srgb, var(--color-neutral-1000) 4%, transparent)",
                }}
                formatter={(value, name) => [
                  formatMoney(Number(value)),
                  PROVIDER_META[name as CombinedProviderId]?.shortLabel ??
                    String(name),
                ]}
                labelFormatter={(label) => String(label)}
                contentStyle={tooltipStyle}
              />
              {connectedProviderIds.map((providerId) => (
                <Bar
                  key={providerId}
                  dataKey={providerId}
                  fill={PROVIDER_META[providerId].color}
                  maxBarSize={42}
                  stackId="combined-cost"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function CreditSummary({
  credit,
  label,
}: {
  credit: OpsCreditProviderResult | undefined;
  label: string;
}) {
  if (!credit) return null;

  return (
    <div className="mt-4 border-t border-neutral-1000-a05 pt-3">
      <div className="text-xs font-medium text-neutral-muted">{label}</div>
      {credit.status === "ok" && credit.amounts.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {credit.amounts.map((amount) => (
            <span
              key={amount.currency}
              className="text-sm font-semibold tabular-nums text-neutral-primary"
            >
              {formatMoney(amount.amount, amount.currency)}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1 text-xs text-neutral-soft">
          {credit.message ?? statusLabel(credit.status)}
        </div>
      )}
    </div>
  );
}

function getUsdCreditAmount(credit: OpsCreditProviderResult | undefined) {
  if (credit?.status !== "ok") return null;
  return (
    credit.amounts.find((amount) => amount.currency === "USD")?.amount ?? 0
  );
}

function getAwsCreditForecast(credit: OpsCreditProviderResult | undefined) {
  if (credit?.status !== "ok") return null;
  const usdAmount = credit.amounts.find((amount) => amount.currency === "USD");
  const remainingCredit = usdAmount?.amount ?? 0;
  const usedThisMonth = usdAmount?.currentPeriodUsedAmount ?? 0;
  const completedDays = new Date().getUTCDate() - 1;
  if (remainingCredit <= 0 || usedThisMonth <= 0 || completedDays <= 0) {
    return null;
  }

  const dailyBurn = usedThisMonth / completedDays;
  const daysRemaining = Math.ceil(remainingCredit / dailyBurn);
  const today = toDateOnly(new Date());
  const depletionDate = addUtcDays(today, daysRemaining);
  const usdItems = credit.items.filter(
    (item) => item.currency === "USD" && item.amount > 0
  );
  const hasNonExpiringCredit = usdItems.some((item) => !item.expiresAt);
  const expirationDates = usdItems
    .map((item) => item.expiresAt?.slice(0, 10) ?? null)
    .filter((date): date is string => Boolean(date))
    .sort();
  const earliestExpiration = expirationDates[0] ?? null;
  const latestExpiration = hasNonExpiringCredit
    ? null
    : (expirationDates.at(-1) ?? null);
  const limitedByExpiration = Boolean(
    latestExpiration && latestExpiration < depletionDate
  );
  return {
    dailyBurn,
    depletionDate,
    daysRemaining,
    earliestExpiration,
    endDate:
      limitedByExpiration && latestExpiration
        ? latestExpiration
        : depletionDate,
    latestExpiration,
    limitedByExpiration,
    sampleDays: completedDays,
    usedThisMonth,
  };
}

function ServiceCostRow({
  credit,
  provider,
  rows,
}: {
  credit?: OpsCreditProviderResult;
  provider: OpsCostProviderResult;
  rows: CostChartRow[];
}) {
  const meta = PROVIDER_META[provider.id];
  const isEc2 = provider.id === "ec2";
  const netTotal = Math.max(0, provider.netTotal ?? provider.total);
  const coveredTotal = Math.max(0, provider.total - netTotal);
  const forecast = isEc2 ? getAwsCreditForecast(credit) : null;

  return (
    <article
      className={cx(
        opsTheme.panel,
        "grid min-w-0 gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-stretch"
      )}
    >
      <div className="min-w-0 lg:border-r lg:border-neutral-1000-a05 lg:pr-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: meta.color }}
            />
            <h3 className="truncate text-sm font-semibold text-neutral-primary">
              {provider.label}
            </h3>
          </div>
          <StatusBadge status={provider.status} />
        </div>

        {isEc2 && provider.status === "ok" ? (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
            <div>
              <div className="text-xs text-neutral-muted">사용 비용</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-primary">
                {formatMoney(provider.total)}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-muted">실청구 예상</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-neutral-primary">
                {formatMoney(netTotal)}
              </div>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 border-t border-neutral-1000-a05 pt-3 text-xs">
              <span className="text-neutral-muted">크레딧·할인 적용</span>
              <span className="font-medium tabular-nums text-neutral-primary">
                {formatMoney(coveredTotal)}
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5 text-xs text-neutral-muted">총 비용</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-primary">
              {provider.status === "ok" ? formatMoney(provider.total) : "-"}
            </div>
          </>
        )}

        {provider.message ? (
          <p className="mt-3 break-words text-[11px] leading-4 text-neutral-muted">
            {provider.message}
          </p>
        ) : null}

        {isEc2 ? (
          <>
            <CreditSummary credit={credit} label="남은 AWS 크레딧" />
            {forecast ? (
              <div className="mt-3 rounded bg-bg-weak px-3 py-2.5">
                <div className="text-xs font-medium text-neutral-primary">
                  {formatDate(forecast.endDate)} 전후 크레딧 종료 예상
                </div>
                <div className="mt-1 text-[11px] leading-4 text-neutral-muted">
                  {forecast.limitedByExpiration
                    ? `현재 속도상 소진은 ${formatDate(forecast.depletionDate)}이지만 최종 크레딧 만료가 더 빠릅니다.`
                    : `현재 속도 기준 약 ${forecast.daysRemaining.toLocaleString("ko-KR")}일 남았습니다.`}
                </div>
                <div className="mt-1 text-[11px] leading-4 text-neutral-muted">
                  이번 달 {formatMoney(forecast.usedThisMonth)} 사용 ·{" "}
                  {forecast.sampleDays}일간 일평균{" "}
                  {formatMoney(forecast.dailyBurn)}
                </div>
                {forecast.earliestExpiration &&
                forecast.latestExpiration &&
                forecast.earliestExpiration !== forecast.latestExpiration ? (
                  <div className="mt-1 text-[11px] leading-4 text-neutral-soft">
                    일부 크레딧 {formatDate(forecast.earliestExpiration)}부터
                    만료 · 최종 {formatDate(forecast.latestExpiration)}
                  </div>
                ) : null}
              </div>
            ) : credit?.status === "ok" &&
              (getUsdCreditAmount(credit) ?? 0) > 0 ? (
              <div className="mt-3 text-[11px] leading-4 text-neutral-muted">
                이번 달 크레딧 사용량이 집계되면 소진 예상이 표시됩니다.
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {provider.status !== "ok" ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-neutral-soft">
          {statusLabel(provider.status)}
        </div>
      ) : (
        <div className="min-w-0">
          {isEc2 ? (
            <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-neutral-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#e38b2c]" />
                사용 비용
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#44505e]" />
                실청구 예상
              </span>
            </div>
          ) : null}
          <div className="h-[168px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rows}
                margin={{ bottom: 0, left: 0, right: 6, top: 6 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--color-neutral-1000) 5%, transparent)"
                  vertical={false}
                />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  fontSize={10}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tickLine={false}
                  tick={{ fill: "var(--color-neutral-soft)" }}
                />
                <YAxis hide domain={[0, "dataMax"]} />
                <Tooltip
                  cursor={{
                    fill: "color-mix(in srgb, var(--color-neutral-1000) 4%, transparent)",
                  }}
                  formatter={(value, name) => {
                    const labels: Record<string, string> = {
                      ec2: "사용 비용",
                      ec2Net: "실청구 예상",
                    };
                    return [
                      formatMoney(Number(value)),
                      labels[String(name)] ?? meta.shortLabel,
                    ];
                  }}
                  labelFormatter={(label) => String(label)}
                  contentStyle={tooltipStyle}
                />
                {isEc2 ? (
                  <Bar
                    dataKey="ec2"
                    fill={meta.color}
                    maxBarSize={34}
                    radius={[2, 2, 0, 0]}
                  />
                ) : (
                  <Bar
                    dataKey={provider.id}
                    fill={meta.color}
                    maxBarSize={34}
                    radius={[2, 2, 0, 0]}
                  />
                )}
                {isEc2 ? (
                  <Bar
                    dataKey="ec2Net"
                    fill="#44505e"
                    maxBarSize={34}
                    minPointSize={2}
                    radius={[2, 2, 0, 0]}
                  />
                ) : null}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </article>
  );
}

function DeepSeekCreditRow({
  credit,
}: {
  credit: OpsCreditProviderResult | undefined;
}) {
  const amount = credit?.amounts[0];
  const total = amount?.amount ?? 0;
  const granted = amount?.grantedAmount ?? 0;
  const toppedUp = amount?.toppedUpAmount ?? 0;
  const grantedShare = total > 0 ? (granted / total) * 100 : 0;
  const toppedUpShare = total > 0 ? (toppedUp / total) * 100 : 0;
  const status = credit?.status ?? "not_configured";

  return (
    <article
      className={cx(
        opsTheme.panel,
        "grid min-w-0 gap-4 p-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center"
      )}
    >
      <div className="min-w-0 lg:border-r lg:border-neutral-1000-a05 lg:pr-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm bg-[#7b61a8]" />
            <h3 className="truncate text-sm font-semibold text-neutral-primary">
              DeepSeek
            </h3>
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="mt-5 text-xs text-neutral-muted">현재 크레딧</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-neutral-primary">
          {credit?.status === "ok" && amount
            ? formatMoney(amount.amount, amount.currency)
            : "-"}
        </div>
        {credit?.message ? (
          <p className="mt-3 text-[11px] leading-4 text-neutral-muted">
            {credit.message}
          </p>
        ) : null}
      </div>

      {credit?.status === "ok" && amount ? (
        <div className="min-w-0 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-neutral-muted">잔액 구성</span>
            <span className="tabular-nums text-neutral-soft">
              {amount.currency}
            </span>
          </div>
          <div className="mt-4 flex h-7 w-full overflow-hidden rounded bg-bg-weak">
            {grantedShare > 0 ? (
              <div
                className="h-full bg-[#7b61a8]"
                style={{ width: `${grantedShare}%` }}
              />
            ) : null}
            {toppedUpShare > 0 ? (
              <div
                className="h-full bg-[#2b8a78]"
                style={{ width: `${toppedUpShare}%` }}
              />
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-neutral-muted">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#7b61a8]" />
              Grant {formatMoney(granted, amount.currency)}
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#2b8a78]" />
              충전 {formatMoney(toppedUp, amount.currency)}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex min-h-[120px] items-center justify-center text-sm text-neutral-soft">
          {statusLabel(status)}
        </div>
      )}
    </article>
  );
}

function SegmentedButton<T extends string | number>({
  onChange,
  options,
  value,
}: {
  onChange: (value: T) => void;
  options: readonly { label: string; value: T }[];
  value: T;
}) {
  return (
    <div className="inline-flex rounded-md bg-bg-weak p-1">
      {options.map((option) => (
        <BareButton
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cx(
            "h-8 rounded px-3 text-xs font-medium transition",
            value === option.value
              ? "bg-bg-default text-neutral-primary shadow-sm"
              : "text-neutral-muted hover:text-neutral-primary"
          )}
        >
          {option.label}
        </BareButton>
      ))}
    </div>
  );
}

export default function OpsCostPage() {
  const canFetchInternal = useCanFetchInternal();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const range = useMemo(() => getDateRange(rangeDays), [rangeDays]);
  const costQuery = useOpsCosts(range.from, range.through, canFetchInternal);
  const data = costQuery.data;

  const chartRows = useMemo(() => {
    if (!data) return [];
    const dailyRows = buildDailyRows(data);
    return granularity === "weekly"
      ? buildWeeklyRows(dailyRows, data.from, data.through)
      : dailyRows;
  }, [data, granularity]);

  const awsCredit = data?.credits.find((credit) => credit.id === "aws");
  const deepSeekCredit = data?.credits.find(
    (credit) => credit.id === "deepseek"
  );

  return (
    <DebuggingPageShell
      showContextLabel={false}
      tab="cost"
      filters={
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <SegmentedButton
            value={rangeDays}
            onChange={setRangeDays}
            options={[
              { label: "최근 7일", value: 7 },
              { label: "최근 30일", value: 30 },
            ]}
          />
          <SegmentedButton
            value={granularity}
            onChange={setGranularity}
            options={[
              { label: "일별", value: "daily" },
              { label: "주별", value: "weekly" },
            ]}
          />
          <BareButton
            type="button"
            onClick={() => void costQuery.refetch()}
            disabled={costQuery.isFetching}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
          >
            <RefreshCw
              className={cx(
                "h-4 w-4",
                costQuery.isFetching ? "animate-spin" : ""
              )}
            />
            새로고침
          </BareButton>
          <div className="text-[11px] tabular-nums text-neutral-soft">
            {formatDate(range.from)} – {formatDate(range.through)} UTC
          </div>
        </div>
      }
    >
      {costQuery.isLoading ? (
        <div
          className={cx(
            opsTheme.panel,
            "flex min-h-[420px] items-center justify-center"
          )}
        >
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : costQuery.error ? (
        <div className={opsTheme.errorNotice}>
          {costQuery.error instanceof Error
            ? costQuery.error.message
            : "비용을 불러오지 못했습니다."}
        </div>
      ) : data ? (
        <>
          <CombinedCostChart providers={data.costs} rows={chartRows} />

          <div className="space-y-3">
            {data.costs.map((provider) => (
              <ServiceCostRow
                key={provider.id}
                provider={provider}
                rows={chartRows}
                credit={provider.id === "ec2" ? awsCredit : undefined}
              />
            ))}
            <DeepSeekCreditRow credit={deepSeekCredit} />
          </div>

          <div className="px-1 text-[11px] leading-5 text-neutral-soft">
            비용 일자는 UTC 기준입니다. 오늘 값은 제공사 집계 지연으로 이후
            변경될 수 있습니다. EC2 사용 비용은 Credit line을 제외하고,
            실청구 예상은 Credit line까지 포함한 UnblendedCost 합계입니다.
            compute와 EC2-Other를 합산하며, 소진일은 이번 달 AWS 전체 크레딧
            사용 속도를 기준으로 계산한 단순 추정치입니다.
          </div>
        </>
      ) : null}
    </DebuggingPageShell>
  );
}
