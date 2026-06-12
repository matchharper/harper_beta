import {
  BadgeCheck,
  Banknote,
  Briefcase,
  Check,
  MapPin,
  OctagonX,
  ShieldCheck,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type {
  CareerPreferenceFitItem,
  CareerPreferenceFitKey,
  CareerPreferenceFitStatus,
} from "../types";
import { cn } from "@/lib/utils";
import { Tooltips } from "@/components/ui/tooltip";

const PREFERENCE_FIT_ICON: Record<CareerPreferenceFitKey, LucideIcon> = {
  next_scope: Briefcase,
  location: MapPin,
  compensation: Banknote,
  deal_breakers: OctagonX,
  must_haves: ShieldCheck,
};

const PREFERENCE_FIT_STATUS_META: Record<
  CareerPreferenceFitStatus,
  {
    label: React.ReactNode;
    statusClassName: string;
  }
> = {
  Satisfied: {
    label: <Check className="h-4 w-4" />,
    statusClassName: "text-positive",
  },
  Neutral: {
    label: <TriangleAlert className="h-3.5 w-3.5" />,
    statusClassName: "text-info",
  },
  Dissatisfied: {
    label: <X className="h-3.5 w-3.5" />,
    statusClassName: "text-critical",
  },
};

const PreferenceFitIconFallback = BadgeCheck;

const OpportunityPreferenceFit = ({
  className,
  items,
  variant = "compact",
}: {
  className?: string;
  items?: CareerPreferenceFitItem[];
  variant?: "compact" | "detail";
}) => {
  const visibleItems = (items ?? []).filter((item) => item.note.trim());
  if (visibleItems.length === 0) return null;

  return (
    <div
      className={cn(
        variant === "detail"
          ? "grid w-full gap-2 sm:grid-cols-1"
          : "w-full flex flex-row items-center justify-between gap-2",
        className
      )}
    >
      {visibleItems.map((item) => {
        const meta = PREFERENCE_FIT_STATUS_META[item.status];
        const Icon = PREFERENCE_FIT_ICON[item.key] ?? PreferenceFitIconFallback;

        return (
          <Tooltips
            text={item.note}
            key={`${item.key}-${item.status}-${item.note}`}
          >
            <div
              className={cn(
                "min-w-0 rounded-[8px] py-2",
                variant === "detail"
                  ? "flex items-start gap-2.5"
                  : "inline-flex max-w-full items-center gap-2"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full bg-bg-weak text-neutral-primary",
                  variant === "detail" ? "h-7 w-7" : "h-6 w-6"
                )}
              >
                <Icon
                  className={variant === "detail" ? "h-4 w-4" : "h-3.5 w-3.5"}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 flex-wrap items-center gap-0.5">
                  <span className="text-[13px] font-medium leading-5 text-neutral-primary">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4",
                      meta.statusClassName
                    )}
                  >
                    {meta.label}
                  </span>
                </span>
                {variant !== "compact" && (
                  <span
                    className={cn(
                      "mt-0.5 block text-[13px] leading-5 text-neutral-muted"
                    )}
                  >
                    {item.note}
                  </span>
                )}
              </span>
            </div>
          </Tooltips>
        );
      })}
    </div>
  );
};

export default OpportunityPreferenceFit;
