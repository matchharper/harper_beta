import { useEffect, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loading } from "@/components/ui/loading";
import { showToast } from "@/components/toast/toast";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import {
  ADMIN_METRIC_DEFAULT_GRID_COLS,
  ADMIN_METRIC_DEFAULT_SELECTED_KEYS,
  ADMIN_METRIC_DEFINITIONS,
  ADMIN_METRIC_DEFAULT_START_DATE,
} from "@/lib/adminMetrics/constants";
import type {
  AdminMetricInterval,
  AdminMetricKey,
  AdminMetricsResponse,
} from "@/lib/adminMetrics/types";
import {
  aggregateMetricBuckets,
  clampMetricGridCols,
  getKstTodayDate,
  normalizeExcludedEmails,
} from "@/lib/adminMetrics/utils";
import { useAdminMetricsStore } from "./useAdminMetricsStore";
import AdminMetricChartCard from "./AdminMetricChartCard";
import AdminMetricsControls from "./AdminMetricsControls";
import AdminMetricsExcludedEmails from "./AdminMetricsExcludedEmails";

type AdminMetricsTabProps = {
  enabled: boolean;
  refreshToken?: number;
};

async function fetchAdminMetrics(args: {
  startDate: string;
  endDate: string;
  excludedEmails: string[];
}) {
  const response = await fetch("/api/admin/metrics", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-password": ADMIN_PAGE_PASSWORD,
    },
    body: JSON.stringify(args),
  });

  const json = (await response.json().catch(() => ({}))) as
    | AdminMetricsResponse
    | { error?: string };

  if (!response.ok) {
    throw new Error(
      String((json as { error?: string })?.error ?? "Failed to load metrics")
    );
  }

  return json as AdminMetricsResponse;
}

function toggleMetricSelection(
  current: AdminMetricKey[],
  metricKey: AdminMetricKey
) {
  if (current.includes(metricKey)) {
    return current.filter((key) => key !== metricKey);
  }

  const next = [...current, metricKey];
  const order = new Map(
    ADMIN_METRIC_DEFINITIONS.map((metric, index) => [metric.key, index])
  );

  return next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export default function AdminMetricsTab({
  enabled,
  refreshToken = 0,
}: AdminMetricsTabProps) {
  const { excludedEmails, setExcludedEmails, resetExcludedEmails } =
    useAdminMetricsStore();
  const [interval, setInterval] = useState<AdminMetricInterval>("day");
  const [selectedMetricKeys, setSelectedMetricKeys] = useState<AdminMetricKey[]>(
    ADMIN_METRIC_DEFAULT_SELECTED_KEYS
  );
  const [startDate, setStartDate] = useState(ADMIN_METRIC_DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(getKstTodayDate());
  const [gridCols, setGridCols] = useState(ADMIN_METRIC_DEFAULT_GRID_COLS);

  const metricsQuery = useQuery({
    queryKey: ["admin-metrics", startDate, endDate, excludedEmails],
    queryFn: () =>
      fetchAdminMetrics({
        startDate,
        endDate,
        excludedEmails,
      }),
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (!enabled || refreshToken === 0) return;
    void metricsQuery.refetch();
    // react-query refetch reference is stable enough for this usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refreshToken]);

  const aggregatedBuckets = aggregateMetricBuckets(
    metricsQuery.data?.buckets ?? [],
    interval
  );
  const selectedMetrics = ADMIN_METRIC_DEFINITIONS.filter((metric) =>
    selectedMetricKeys.includes(metric.key)
  );

  return (
    <div className="space-y-4">
      <AdminMetricsControls
        selectedMetricKeys={selectedMetricKeys}
        onToggleMetric={(metricKey) =>
          setSelectedMetricKeys((current) =>
            toggleMetricSelection(current, metricKey)
          )
        }
        interval={interval}
        onIntervalChange={setInterval}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={(value) =>
          setStartDate(value || ADMIN_METRIC_DEFAULT_START_DATE)
        }
        onEndDateChange={(value) => setEndDate(value || getKstTodayDate())}
        gridCols={gridCols}
        onGridColsChange={(value) => setGridCols(clampMetricGridCols(value))}
      />

      <AdminMetricsExcludedEmails
        excludedEmails={excludedEmails}
        onSave={(value) => {
          setExcludedEmails(value);
          showToast({
            message: `Excluded emails saved (${normalizeExcludedEmails(value).length})`,
            variant: "white",
          });
        }}
        onReset={() => {
          resetExcludedEmails();
          showToast({
            message: "Excluded emails reset to defaults",
            variant: "white",
          });
        }}
      />

      {metricsQuery.isLoading ? (
        <div
          className="border border-black/10 bg-white p-6"
          style={{ borderRadius: 0 }}
        >
          <Loading label="Loading metrics..." />
        </div>
      ) : metricsQuery.error ? (
        <div
          className="border border-red-200 bg-red-50 p-4 text-[13px] text-red-700"
          style={{ borderRadius: 0 }}
        >
          {metricsQuery.error instanceof Error
            ? metricsQuery.error.message
            : "Failed to load metrics"}
        </div>
      ) : selectedMetrics.length === 0 ? (
        <div
          className="border border-black/10 bg-white p-6 text-[13px] text-black/55"
          style={{ borderRadius: 0 }}
        >
          상단에서 지표를 하나 이상 선택해 주세요.
        </div>
      ) : (
        <div
          className="grid grid-cols-1 gap-4 md:[grid-template-columns:var(--admin-metrics-grid)]"
          style={
            {
              "--admin-metrics-grid": `repeat(${gridCols}, minmax(0, 1fr))`,
            } as CSSProperties
          }
        >
          {selectedMetrics.map((metric) => (
            <AdminMetricChartCard
              key={metric.key}
              metric={metric}
              buckets={aggregatedBuckets}
            />
          ))}
        </div>
      )}
    </div>
  );
}
