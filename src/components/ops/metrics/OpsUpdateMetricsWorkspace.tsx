import dynamic from "next/dynamic";
import { useRouter } from "next/router";
import { Fragment, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import OpsMetricSnapshotStamp from "@/components/ops/metrics/OpsMetricSnapshotStamp";
import { cx } from "@/components/ops/theme";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOpsUpdateMetrics } from "@/hooks/ops/useOpsUpdateMetrics";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  kstDateOnly,
  OPS_UPDATE_RELEASES,
  updateMetricDisplayValue,
  type UpdateMetricRow,
  type UpdateMetricsBucket,
  type UpdateMetricUnit,
  type UpdateMetricValue,
} from "@/lib/ops/updateMetrics";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsInternalDataExclusionStore } from "@/store/useOpsInternalDataExclusionStore";

const release = OPS_UPDATE_RELEASES[0];

// Charts load with their own data, apart from the comparison table.
const OpsEmailActionMetrics = dynamic(
  () => import("@/components/ops/metrics/OpsEmailActionMetrics"),
  { ssr: false }
);

function formatValue(unit: UpdateMetricUnit, value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  if (unit === "percent") return `${(value * 100).toFixed(1)}%`;
  if (unit === "usd") return `$${value.toFixed(2)}`;
  if (unit === "minutes") return `${value.toFixed(1)}분`;
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

function sampleText(value: UpdateMetricValue) {
  if (value.kind === "rate") {
    return `${value.numerator.toLocaleString("ko-KR")} / ${value.denominator.toLocaleString("ko-KR")}`;
  }
  if (value.kind === "average") {
    return `${value.denominator.toLocaleString("ko-KR")}명 평균`;
  }
  return `${value.value.toLocaleString("ko-KR")}건 / ${value.days.toFixed(1)}일`;
}

function formatDelta(row: UpdateMetricRow) {
  const before = updateMetricDisplayValue(row.values.before);
  const after = updateMetricDisplayValue(row.values.after);
  if (before === null || after === null) return { text: "-", tone: null };
  const diff = after - before;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff);
  const text =
    row.unit === "percent"
      ? `${sign}${(abs * 100).toFixed(1)}%p`
      : row.unit === "usd"
        ? `${sign}$${abs.toFixed(2)}`
        : row.unit === "minutes"
          ? `${sign}${abs.toFixed(1)}분`
          : before > 0
            ? `${sign}${((abs / before) * 100).toFixed(0)}%`
            : "-";
  const improved =
    diff === 0 || row.better === null
      ? null
      : (diff > 0) === (row.better === "up");
  return { text, tone: improved };
}

function weekLabel(bucket: UpdateMetricsBucket) {
  const start = kstDateOnly(Date.parse(bucket.start)).slice(5).replace("-", ".");
  const end = kstDateOnly(Date.parse(bucket.end) - 1).slice(5).replace("-", ".");
  return `${start}–${end}`;
}

function Cell({
  className,
  unit,
  value,
}: {
  className?: string;
  unit: UpdateMetricUnit;
  value: UpdateMetricValue;
}) {
  return (
    <td
      className={cx("px-3 py-2.5 text-right tabular-nums", className)}
      title={sampleText(value)}
    >
      {formatValue(unit, updateMetricDisplayValue(value))}
    </td>
  );
}

export default function OpsUpdateMetricsWorkspace() {
  const router = useRouter();
  // Until the release is out, compare against today.
  const [today] = useState(() => kstDateOnly(Date.now()));
  const queryDeployedOn =
    typeof router.query.deployedOn === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(router.query.deployedOn)
      ? router.query.deployedOn
      : null;
  const deployedOn =
    queryDeployedOn ?? release?.deployedOn ?? today;
  const authLoading = useAuthStore((state) => state.loading);
  const userEmail = useAuthStore((state) => state.user?.email);
  const exclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const canFetch =
    router.isReady && !authLoading && isInternalEmail(userEmail);
  const query = useOpsUpdateMetrics(canFetch, {
    deployedOn,
    excludedEmails: exclusionTerms,
  });
  const data = query.data;
  const isUpdating = query.isFetching || Boolean(data?.snapshot.refreshing);
  const beforeBuckets = data?.buckets.filter((bucket) => bucket.side === "before") ?? [];
  const afterBuckets = data?.buckets.filter((bucket) => bucket.side === "after") ?? [];

  return (
    <div>
      <header className="border-b border-neutral-1000-a05 pb-5 pt-2">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="mt-1 font-hedvig text-[2rem] leading-none tracking-[-0.06em] text-neutral-primary">
              업데이트 지표
            </h1>
            {release ? (
              <div className="mt-2 text-sm text-neutral-muted">
                {release.title}
                {release.deployedOn ? null : " · 배포 전"}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-muted">
              배포일
              <Input
                aria-label="배포일"
                className="w-[155px]"
                onChange={(event) => {
                  const value = event.target.value;
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
                  void router.replace(
                    { pathname: router.pathname, query: { ...router.query, deployedOn: value } },
                    undefined,
                    { shallow: true }
                  );
                }}
                type="date"
                value={deployedOn}
              />
            </label>
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

      {data ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-1000-a05 text-[12px] text-neutral-soft">
                <th className="px-3 py-2.5 text-left font-normal">지표</th>
                <th className="px-3 py-2.5 text-right font-normal">배포 전 {beforeBuckets.length}주</th>
                <th className="px-3 py-2.5 text-right font-normal">배포 후</th>
                <th className="px-3 py-2.5 text-right font-normal">변화</th>
                {data.buckets.map((bucket, index) => (
                  <th
                    className={cx(
                      "px-3 py-2.5 text-right font-normal",
                      bucket.side === "after" && "bg-bg-weak",
                      index === beforeBuckets.length && "border-l border-neutral-1000-a10"
                    )}
                    key={bucket.start}
                  >
                    {weekLabel(bucket)}
                    {bucket.partial ? " ·진행 중" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.groups.map((group) => (
                <Fragment key={group.key}>
                  <tr className="border-b border-neutral-1000-a05">
                    <th
                      className="px-3 pb-1.5 pt-5 text-left text-[12px] font-medium text-neutral-primary"
                      colSpan={4 + data.buckets.length}
                      scope="colgroup"
                    >
                      {group.label}
                    </th>
                  </tr>
                  {group.rows.map((row) => {
                    const delta = formatDelta(row);
                    return (
                      <tr className="border-b border-neutral-1000-a05" key={row.key}>
                        <th className="px-3 py-2.5 text-left font-normal text-neutral-primary" scope="row">
                          <span title={row.detail}>{row.label}</span>
                        </th>
                        <Cell unit={row.unit} value={row.values.before} />
                        <Cell
                          className="font-medium text-neutral-primary"
                          unit={row.unit}
                          value={row.values.after}
                        />
                        <td
                          className={cx(
                            "px-3 py-2.5 text-right tabular-nums",
                            delta.tone === true && "text-positive",
                            delta.tone === false && "text-critical",
                            delta.tone === null && "text-neutral-muted"
                          )}
                        >
                          {delta.text}
                        </td>
                        {row.values.buckets.map((value, index) => (
                          <Cell
                            className={cx(
                              "text-neutral-muted",
                              data.buckets[index]?.side === "after" && "bg-bg-weak",
                              index === beforeBuckets.length && "border-l border-neutral-1000-a10"
                            )}
                            key={data.buckets[index]?.start ?? index}
                            unit={row.unit}
                            value={value}
                          />
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
          {afterBuckets.length === 0 ? (
            <div className="py-4 text-sm text-neutral-muted">배포 후 데이터가 아직 없습니다.</div>
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
      <OpsEmailActionMetrics enabled={canFetch} excludedEmails={exclusionTerms} />
    </div>
  );
}
