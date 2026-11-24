import "server-only";

import { after } from "next/server";
import {
  readOpsMetricSnapshot,
  type OpsMetricSnapshotRow,
  type OpsMetricSnapshotStore,
  type WithOpsMetricSnapshot,
} from "@/lib/ops/metricSnapshots";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

type SnapshotRecord = {
  computed_at: string;
  computed_by: string;
  refresh_error: string | null;
  refresh_started_at: string | null;
  value: unknown;
};

type QueryResult<T> = PromiseLike<{ data: T; error: { message?: string } | null }>;

type SnapshotQuery = QueryResult<SnapshotRecord[] | null> & {
  eq: (column: string, value: string) => SnapshotQuery;
  maybeSingle: () => QueryResult<SnapshotRecord | null>;
  or: (filters: string) => SnapshotQuery;
  select: (columns: string) => SnapshotQuery;
};

type SnapshotTable = {
  select: (columns: string) => SnapshotQuery;
  update: (values: Partial<SnapshotRecord>) => SnapshotQuery;
  upsert: (values: SnapshotRecord & { key: string }) => QueryResult<null>;
};

const TABLE = "ops_metric_snapshots";
// Local runs read the production database too: their snapshots stay apart from deployed ones.
const ENVIRONMENT = process.env.VERCEL_ENV || "local";
const BUILD = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || "local";

function table() {
  const admin = getTalentSupabaseAdmin() as unknown as { from: (name: string) => SnapshotTable };
  return admin.from(TABLE);
}

function check(error: { message?: string } | null, action: string) {
  if (error) throw new Error(`지표 집계 결과를 ${action}하지 못했습니다: ${error.message ?? "unknown"}`);
}

const store: OpsMetricSnapshotStore = {
  async claimRefresh(key, { retryFailed, staleLeaseBefore }) {
    const free = [
      "refresh_started_at.is.null",
      `refresh_started_at.lt.${staleLeaseBefore.toISOString()}`,
      ...(retryFailed ? ["refresh_error.not.is.null"] : []),
    ].join(",");
    const { data, error } = await table()
      .update({ refresh_error: null, refresh_started_at: new Date().toISOString() })
      .eq("key", key)
      .or(free)
      .select("key");
    check(error, "갱신");
    return Boolean(data?.length);
  },
  async failRefresh(key, message) {
    const { error } = await table().update({ refresh_error: message }).eq("key", key);
    check(error, "기록");
  },
  async read(key): Promise<OpsMetricSnapshotRow | null> {
    const { data, error } = await table()
      .select("value, computed_at, computed_by, refresh_started_at, refresh_error")
      .eq("key", key)
      .maybeSingle();
    check(error, "읽");
    if (!data) return null;
    return {
      computedAt: data.computed_at,
      computedBy: data.computed_by,
      refreshError: data.refresh_error,
      refreshStartedAt: data.refresh_started_at,
      value: data.value,
    };
  },
  async save(key, value, computedBy) {
    const computedAt = new Date().toISOString();
    const { error } = await table().upsert({
      computed_at: computedAt,
      computed_by: computedBy,
      key,
      refresh_error: null,
      refresh_started_at: null,
      value,
    });
    check(error, "저장");
    return computedAt;
  },
};

/** The last result for this view, recomputed after the response when it is stale (see `readOpsMetricSnapshot`). */
export function readOpsMetricSnapshotForRoute<T>(args: {
  compute: () => Promise<T>;
  force?: boolean;
  key: string;
}): Promise<WithOpsMetricSnapshot<T>> {
  return readOpsMetricSnapshot({
    build: BUILD,
    compute: args.compute,
    force: args.force,
    key: `${ENVIRONMENT}:${args.key}`,
    schedule: (task) => after(task),
    store,
  });
}
