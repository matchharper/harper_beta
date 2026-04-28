import { ADMIN_METRIC_DEFINITIONS } from "@/lib/adminMetrics/constants";
import type {
  AdminMetricInterval,
  AdminMetricKey,
} from "@/lib/adminMetrics/types";

type AdminMetricsControlsProps = {
  selectedMetricKeys: AdminMetricKey[];
  onToggleMetric: (metricKey: AdminMetricKey) => void;
  interval: AdminMetricInterval;
  onIntervalChange: (value: AdminMetricInterval) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  gridCols: number;
  onGridColsChange: (value: number) => void;
};

const INTERVAL_OPTIONS: Array<{
  value: AdminMetricInterval;
  label: string;
}> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default function AdminMetricsControls({
  selectedMetricKeys,
  onToggleMetric,
  interval,
  onIntervalChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  gridCols,
  onGridColsChange,
}: AdminMetricsControlsProps) {
  return (
    <div className="space-y-4">
      <div
        className="border border-black/10 bg-white p-4"
        style={{ borderRadius: 0 }}
      >
        <div className="text-[13px] font-semibold text-black">지표 선택</div>
        <div className="mt-1 text-[12px] text-black/60">
          체크한 지표만 아래 그래프로 추가됩니다.
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {ADMIN_METRIC_DEFINITIONS.map((metric) => {
            const isSelected = selectedMetricKeys.includes(metric.key);

            return (
              <label
                key={metric.key}
                className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-[12px] transition ${
                  isSelected
                    ? "border-black bg-black text-white"
                    : "border-black/15 bg-white text-black hover:border-black/30 hover:bg-black/[0.05]"
                }`}
                style={{ borderRadius: 0 }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleMetric(metric.key)}
                  className="hidden"
                />
                <span
                  className="h-2.5 w-2.5 shrink-0"
                  style={{
                    borderRadius: 999,
                    backgroundColor: metric.color,
                  }}
                />
                <span>{metric.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div
        className="border border-black/10 bg-white p-4"
        style={{ borderRadius: 0 }}
      >
        <div className="grid gap-4 md:grid-cols-[1.2fr_1.4fr_0.7fr]">
          <div>
            <div className="text-[12px] font-semibold text-black">
              Bucket
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((option) => {
                const isActive = interval === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onIntervalChange(option.value)}
                    className={`h-9 px-3 text-[12px] border transition ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-black/15 hover:border-black/30 hover:bg-black/[0.05]"
                    }`}
                    style={{ borderRadius: 0 }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-black">
              기간
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 w-full border border-black/15 px-3 text-[12px] outline-none transition focus:border-black/35"
                style={{ borderRadius: 0 }}
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="h-9 w-full border border-black/15 px-3 text-[12px] outline-none transition focus:border-black/35"
                style={{ borderRadius: 0 }}
              />
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-black">
              Grid Cols
            </div>
            <input
              type="number"
              min={1}
              max={4}
              value={gridCols}
              onChange={(event) =>
                onGridColsChange(Number(event.target.value || 1))
              }
              className="mt-2 h-9 w-full border border-black/15 px-3 text-[12px] outline-none transition focus:border-black/35"
              style={{ borderRadius: 0 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
