import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMetricValue, getMetricRangeValue, getMetricValue } from "@/lib/adminMetrics/utils";
import type {
  AdminMetricAggregatedBucket,
  AdminMetricDefinition,
} from "@/lib/adminMetrics/types";

type AdminMetricChartCardProps = {
  metric: AdminMetricDefinition;
  buckets: AdminMetricAggregatedBucket[];
};

export default function AdminMetricChartCard({
  metric,
  buckets,
}: AdminMetricChartCardProps) {
  const chartData = buckets.map((bucket) => ({
    xLabel: bucket.label,
    fullLabel: bucket.fullLabel,
    value: getMetricValue(bucket, metric.key),
  }));
  const rangeValue = getMetricRangeValue(buckets, metric.key);
  const hasData = chartData.some((item) => item.value > 0);

  return (
    <div
      className="border border-black/10 bg-white p-4"
      style={{ borderRadius: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0"
              style={{
                borderRadius: 999,
                backgroundColor: metric.color,
              }}
            />
            <div className="text-[13px] font-semibold text-black">
              {metric.label}
            </div>
          </div>
          <div className="mt-1 text-[12px] leading-5 text-black/55">
            {metric.description}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-[0.12em] text-black/35">
            Range
          </div>
          <div className="mt-1 text-[18px] font-semibold text-black">
            {formatMetricValue(metric.key, rangeValue)}
          </div>
        </div>
      </div>

      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="2 4" />
            <XAxis
              dataKey="xLabel"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={{ stroke: "#e5e7eb" }}
              width={60}
              tickFormatter={(value) =>
                formatMetricValue(metric.key, Number(value))
              }
            />
            <Tooltip
              cursor={{ stroke: "#cbd5e1", strokeDasharray: "3 3" }}
              formatter={(value) =>
                formatMetricValue(metric.key, Number(value ?? 0))
              }
              labelFormatter={(_, payload) =>
                String(payload?.[0]?.payload?.fullLabel ?? "")
              }
              contentStyle={{
                borderRadius: 0,
                border: "1px solid rgba(15, 23, 42, 0.12)",
                boxShadow: "none",
                fontSize: "12px",
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={metric.color}
              strokeWidth={2}
              dot={{ r: 2, fill: metric.color, strokeWidth: 0 }}
              activeDot={{ r: 4, fill: metric.color, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {!hasData ? (
        <div className="mt-2 text-[12px] text-black/45">
          선택한 기간에 해당 지표 데이터가 없습니다.
        </div>
      ) : null}
    </div>
  );
}
