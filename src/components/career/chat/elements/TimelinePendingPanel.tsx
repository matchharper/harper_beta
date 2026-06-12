import { Loader2 } from "lucide-react";
import { memo } from "react";

type TimelinePendingPanelProps = {
  label: string;
  detail: string;
};

export const TimelinePendingPanel = memo(function TimelinePendingPanel({
  label,
  detail,
}: TimelinePendingPanelProps) {
  return (
    <div
      role="status"
      className="flex w-full max-w-[760px] items-center gap-2 text-[13px] leading-5 text-neutral-soft"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-neutral-soft" />
      <div className="min-w-0">
        <div className="career-thinking-shimmer inline-block font-medium">
          {label}
        </div>
        <div className="mt-0.5 break-words text-[12px] text-neutral-soft">
          {detail}
        </div>
      </div>
    </div>
  );
});
