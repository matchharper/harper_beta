import { ADMIN_METRIC_DEFINITIONS } from "@/lib/adminMetrics/constants";
import type {
  AdminMetricInterval,
  AdminMetricKey,
} from "@/lib/adminMetrics/types";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";

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
        className="border border-stroke bg-bg-floating p-4"
        style={{ borderRadius: "var(--radius-admin)" }}
      >
        <div className="text-[13px] font-semibold text-neutral-primary">지표 선택</div>
        <div className="mt-1 text-[12px] text-neutral-primary/60">
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
                    ? "border-stroke-strong bg-surface-inverse text-on-inverse"
                    : "border-stroke-strong/15 bg-bg-floating text-neutral-primary hover:border-stroke-strong/30 hover:bg-surface-tint"
                }`}
                style={{ borderRadius: "var(--radius-admin)" }}
              >
                <UiCheckbox
                  unstyled
                  checked={isSelected}
                  onChange={() => onToggleMetric(metric.key)}
                  className="hidden"
                />
                <span
                  className="h-2.5 w-2.5 shrink-0"
                  style={{
                    borderRadius: "var(--radius-pill)",
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
        className="border border-stroke bg-bg-floating p-4"
        style={{ borderRadius: "var(--radius-admin)" }}
      >
        <div className="grid gap-4 md:grid-cols-[1.2fr_1.4fr_0.7fr]">
          <div>
            <div className="text-[12px] font-semibold text-neutral-primary">Bucket</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERVAL_OPTIONS.map((option) => {
                const isActive = interval === option.value;

                return (
                  <BareButton
                    key={option.value}
                    type="button"
                    onClick={() => onIntervalChange(option.value)}
                    className={`h-9 px-3 text-[12px] border transition ${
                      isActive
                        ? "border-stroke-strong bg-surface-inverse text-on-inverse"
                        : "border-stroke-strong/15 hover:border-stroke-strong/30 hover:bg-surface-tint"
                    }`}
                    style={{ borderRadius: "var(--radius-admin)" }}
                  >
                    {option.label}
                  </BareButton>
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-neutral-primary">기간</div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <UiInput
                unstyled
                type="date"
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                className="h-9 w-full border border-stroke-strong/15 px-3 text-[12px] outline-none transition focus:border-stroke-strong/35"
                style={{ borderRadius: "var(--radius-admin)" }}
              />
              <UiInput
                unstyled
                type="date"
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                className="h-9 w-full border border-stroke-strong/15 px-3 text-[12px] outline-none transition focus:border-stroke-strong/35"
                style={{ borderRadius: "var(--radius-admin)" }}
              />
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-neutral-primary">
              Grid Cols
            </div>
            <UiInput
              unstyled
              type="number"
              min={1}
              max={4}
              value={gridCols}
              onChange={(event) =>
                onGridColsChange(Number(event.target.value || 1))
              }
              className="mt-2 h-9 w-full border border-stroke-strong/15 px-3 text-[12px] outline-none transition focus:border-stroke-strong/35"
              style={{ borderRadius: "var(--radius-admin)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
