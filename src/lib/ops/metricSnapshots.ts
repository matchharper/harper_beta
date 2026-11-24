/**
 * /ops 지표 화면은 마지막 집계 결과(snapshot)를 바로 보여 주고, 오래된 결과는 응답 뒤에 다시 집계한다.
 * 집계 쿼리는 기간 전체를 다시 읽어 수십 초가 걸리므로, 화면을 열 때 그 시간을 기다리지 않게 한다.
 *
 * 오래됐는지는 집계한 빌드와 시각으로만 판단한다. 그래서 운영 DB의 지표 함수(`get_ops_talent_metrics_*`)만
 * 바꾸는 migration은 같은 transaction에서 그 지표의 저장 결과를 모든 환경에서 지운다. 지우지 않으면 화면이
 * 옛 기준 값을 먼저 보여 준다. 예: `delete from public.ops_metric_snapshots where key like '%:talent-metrics:retention:%';`
 * 적용할 때 다시 집계 중이던 행(`refresh_started_at`)이 있었다면 옛 함수로 저장될 수 있으니 끝난 뒤 한 번 더 지운다.
 */

export type OpsMetricSnapshotStatus = {
  computedAt: string;
  /** The last refresh failed; the value is from `computedAt`. */
  refreshError: string | null;
  /** A refresh is running; poll until this is false to get its result. */
  refreshing: boolean;
};

export type WithOpsMetricSnapshot<T> = T & { snapshot: OpsMetricSnapshotStatus };

export type OpsMetricSnapshotRow = {
  computedAt: string;
  computedBy: string;
  refreshError: string | null;
  refreshStartedAt: string | null;
  value: unknown;
};

export type OpsMetricSnapshotStore = {
  /** Takes the refresh unless another one started after `staleLeaseBefore` (a failed one too, when `retryFailed`). */
  claimRefresh(key: string, args: { retryFailed: boolean; staleLeaseBefore: Date }): Promise<boolean>;
  failRefresh(key: string, message: string): Promise<void>;
  read(key: string): Promise<OpsMetricSnapshotRow | null>;
  /** Stores a finished result, ends any refresh and returns its `computedAt`. */
  save(key: string, value: unknown, computedBy: string): Promise<string>;
};

/** A snapshot older than this is shown as is and recomputed after the response. */
export const OPS_METRIC_SNAPSHOT_STALE_MS = 5 * 60 * 1_000;
/** Longer than a route's maxDuration (300s): a refresh still marked after this died with its function. */
export const OPS_METRIC_SNAPSHOT_REFRESH_LEASE_MS = 10 * 60 * 1_000;

export async function readOpsMetricSnapshot<T>(args: {
  build: string;
  compute: () => Promise<T>;
  /** The viewer asked to recompute now (the refresh button). */
  force?: boolean;
  key: string;
  nowMs?: number;
  /** Runs the refresh after the response is sent (`after` in a route). */
  schedule: (task: () => Promise<void>) => void;
  store: OpsMetricSnapshotStore;
}): Promise<WithOpsMetricSnapshot<T>> {
  const nowMs = args.nowMs ?? Date.now();
  const row = await args.store.read(args.key);

  if (!row) {
    // First view of this filter: nothing to show yet, so this request waits for it.
    const value = await args.compute();
    const computedAt = await args.store.save(args.key, value, args.build);
    return { ...value, snapshot: { computedAt, refreshError: null, refreshing: false } };
  }

  const leaseStartMs = row.refreshStartedAt ? Date.parse(row.refreshStartedAt) : null;
  const leaseHeld =
    leaseStartMs !== null && leaseStartMs > nowMs - OPS_METRIC_SNAPSHOT_REFRESH_LEASE_MS;
  let refreshing = leaseHeld && !row.refreshError;
  let refreshError = leaseHeld ? row.refreshError : null;

  const stale =
    args.force ||
    row.computedBy !== args.build ||
    Date.parse(row.computedAt) <= nowMs - OPS_METRIC_SNAPSHOT_STALE_MS;
  // A recent failure is retried by the next stale view after its lease, or now when the viewer asks.
  if (stale && !refreshing && (!leaseHeld || args.force)) {
    const claimed = await args.store.claimRefresh(args.key, {
      retryFailed: Boolean(args.force),
      staleLeaseBefore: new Date(nowMs - OPS_METRIC_SNAPSHOT_REFRESH_LEASE_MS),
    });
    if (claimed) {
      refreshing = true;
      refreshError = null;
      args.schedule(async () => {
        try {
          await args.store.save(args.key, await args.compute(), args.build);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[ops metric snapshot] ${args.key} refresh failed`, error);
          await args.store.failRefresh(args.key, message.slice(0, 1_000));
        }
      });
    } else {
      // Another view started it between our read and claim.
      refreshing = true;
    }
  }

  return {
    ...(row.value as T),
    snapshot: { computedAt: row.computedAt, refreshError, refreshing },
  };
}

/** Normalized exclusion terms, as a stable part of a snapshot key. */
export function opsMetricExclusionKey(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)))
    .sort()
    .join(",");
}

/** While a snapshot is being recomputed, the page asks again this often to pick up the result. */
export const OPS_METRIC_SNAPSHOT_POLL_MS = 4_000;

export function opsMetricSnapshotPollInterval(data: { snapshot?: OpsMetricSnapshotStatus } | undefined) {
  return data?.snapshot?.refreshing ? OPS_METRIC_SNAPSHOT_POLL_MS : false;
}
