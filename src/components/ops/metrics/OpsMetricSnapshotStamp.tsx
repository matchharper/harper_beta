import { Tooltips } from "@/components/ui/tooltip";
import type { OpsMetricSnapshotStatus } from "@/lib/ops/metricSnapshots";

const formatter = new Intl.DateTimeFormat("ko-KR", {
  day: "numeric",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "numeric",
  timeZone: "Asia/Seoul",
});

/** When the numbers on screen were computed: the oldest of the page's views, and a failed refresh if any. */
export default function OpsMetricSnapshotStamp({
  snapshots,
}: {
  snapshots: Array<OpsMetricSnapshotStatus | undefined>;
}) {
  const loaded = snapshots.filter((value): value is OpsMetricSnapshotStatus => Boolean(value));
  if (!loaded.length) return null;
  const oldest = loaded.reduce((first, value) =>
    Date.parse(value.computedAt) < Date.parse(first.computedAt) ? value : first
  );
  const refreshError = loaded.find((value) => value.refreshError)?.refreshError;
  return (
    <span className="text-xs tabular-nums text-neutral-muted">
      {formatter.format(new Date(oldest.computedAt))} 집계
      {refreshError ? (
        <Tooltips side="top" text={refreshError}>
          <span className="ml-1.5 text-critical">· 다시 집계 실패</span>
        </Tooltips>
      ) : null}
    </span>
  );
}
