import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { memo, useState } from "react";

import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { careerTimelineBodyTextClassName } from "../careerTimelineTypography";

type ThinkingLogPanelProps = {
  active?: boolean;
  logs: string[];
};

export const ThinkingLogPanel = memo(function ThinkingLogPanel({
  active = false,
  logs,
}: ThinkingLogPanelProps) {
  const [expanded, setExpanded] = useState(active);
  const isExpanded = active || expanded;

  if (logs.length === 0) return null;

  return (
    <div
      className={cn(
        "flex w-full max-w-[760px] flex-col gap-2 text-neutral-muted",
        careerTimelineBodyTextClassName
      )}
      aria-live={active ? "polite" : undefined}
    >
      <BareButton
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        className={cn(
          "inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[8px] py-1 font-medium text-neutral-muted transition-colors hover:text-neutral-muted",
          careerTimelineBodyTextClassName
        )}
      >
        {active ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-soft" />
        ) : isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-neutral-soft" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-neutral-soft" />
        )}
        <span>Thinking</span>
      </BareButton>
      {isExpanded ? (
        <div className="ml-[7px] border-l border-neutral-1000-a05 pl-4">
          <ol className="flex flex-col gap-1.5">
            {logs.map((log, index) => (
              <li
                key={`${index}-${log}`}
                className={cn(
                  "wrap-break-word text-neutral-muted",
                  careerTimelineBodyTextClassName
                )}
              >
                {log}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
});
