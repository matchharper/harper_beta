import {
  BadgeCheck,
  BadgeDollarSign,
  BriefcaseBusiness,
  MapPin,
  OctagonX,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type {
  CareerPreferenceFitItem,
  CareerPreferenceFitKey,
  CareerPreferenceFitStatus,
} from "../types";
import { careerCx } from "../ui/CareerPrimitives";

const PREFERENCE_FIT_ICON: Record<CareerPreferenceFitKey, LucideIcon> = {
  next_scope: BriefcaseBusiness,
  location: MapPin,
  compensation: BadgeDollarSign,
  deal_breakers: OctagonX,
  must_haves: ShieldCheck,
};

const PREFERENCE_FIT_STATUS_META: Record<
  CareerPreferenceFitStatus,
  {
    iconClassName: string;
    label: string;
    rowClassName: string;
    statusClassName: string;
  }
> = {
  Satisfied: {
    iconClassName: "bg-[#e7f2e9] text-[#2f6f4e]",
    label: "충족",
    rowClassName: "border-[#b9d8c2] bg-[#f4faf5]",
    statusClassName: "bg-[#dfeee4] text-[#2f6f4e]",
  },
  Neutral: {
    iconClassName: "bg-beige200 text-beige900/65",
    label: "보류",
    rowClassName: "border-beige900/10 bg-white/55",
    statusClassName: "bg-beige200 text-beige900/65",
  },
  Dissatisfied: {
    iconClassName: "bg-[#f8e5df] text-[#9f3e29]",
    label: "불일치",
    rowClassName: "border-[#e6b9ad] bg-[#fff6f3]",
    statusClassName: "bg-[#f8e5df] text-[#9f3e29]",
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
      className={careerCx(
        variant === "detail"
          ? "grid w-full gap-2 sm:grid-cols-2"
          : "flex flex-wrap gap-2",
        className
      )}
    >
      {visibleItems.map((item) => {
        const meta = PREFERENCE_FIT_STATUS_META[item.status];
        const Icon = PREFERENCE_FIT_ICON[item.key] ?? PreferenceFitIconFallback;

        return (
          <div
            key={`${item.key}-${item.status}-${item.note}`}
            className={careerCx(
              "min-w-0 rounded-[8px] border px-3 py-2",
              variant === "detail"
                ? "flex items-start gap-2.5"
                : "inline-flex max-w-full items-start gap-2",
              meta.rowClassName
            )}
          >
            <span
              className={careerCx(
                "mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                meta.iconClassName
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-[12px] font-medium leading-5 text-beige900">
                  {item.label}
                </span>
                <span
                  className={careerCx(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-4",
                    meta.statusClassName
                  )}
                >
                  {meta.label}
                </span>
              </span>
              <span
                className={careerCx(
                  "mt-0.5 block text-[12px] leading-5 text-beige900/70",
                  variant === "compact" && "line-clamp-2"
                )}
              >
                {item.note}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default OpportunityPreferenceFit;
