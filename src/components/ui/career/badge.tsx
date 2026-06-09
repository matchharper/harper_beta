"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

export type CareerBadgeColor =
  | "neutral"
  | "primary"
  | "critical"
  | "positive"
  | "warning";
export type CareerBadgeVariant = "solid" | "faded" | "outline";
export type CareerBadgeSize = "small" | "medium" | "large";

export interface CareerBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: CareerBadgeColor;
  dismissible?: boolean;
  empty?: boolean;
  endIcon?: React.ReactNode;
  highlighted?: boolean;
  icon?: React.ReactNode;
  onDismiss?: () => void;
  rounded?: boolean;
  size?: CareerBadgeSize;
  variant?: CareerBadgeVariant;
}

const badgeColorClassNames: Record<
  CareerBadgeColor,
  Record<CareerBadgeVariant, string>
> = {
  neutral: {
    solid: "bg-[#F3F1EE] text-black",
    faded: "bg-[#F8F7F5] text-black",
    outline: "border border-[#1F1C1A1A] bg-transparent text-black",
  },
  primary: {
    solid: "bg-neutral-950 text-white",
    faded: "bg-[#F2DFCE] text-[#753B17]",
    outline: "border border-[#F2DFCE] bg-transparent text-[#753B17]",
  },
  critical: {
    solid: "bg-[#9B2E1E] text-white",
    faded: "bg-[#FFEDEA] text-[#9B2E1E]",
    outline: "border border-[#FFDDD7] bg-transparent text-[#9B2E1E]",
  },
  positive: {
    solid: "bg-[#226939] text-white",
    faded: "bg-[#EBFFF3] text-[#226939]",
    outline: "border border-[#D4F3DE] bg-transparent text-[#226939]",
  },
  warning: {
    solid: "bg-[#D78519] text-white",
    faded: "bg-[#FFF6E7] text-[#8A540E]",
    outline: "border border-[#F4D5A1] bg-transparent text-[#8A540E]",
  },
};

const badgeSizeClassNames: Record<CareerBadgeSize, string> = {
  small: "h-5 gap-1 px-1.5 text-[11px] leading-4 [&_svg]:size-3",
  medium: "h-6 gap-1.5 px-2 text-[12px] leading-4 [&_svg]:size-3.5",
  large: "h-7 gap-1.5 px-2.5 text-[13px] leading-[18px] [&_svg]:size-4",
};

const emptySizeClassNames: Record<CareerBadgeSize, string> = {
  small: "size-2 p-0",
  medium: "size-3 p-0",
  large: "size-3.5 p-0",
};

const CareerBadge = React.forwardRef<HTMLSpanElement, CareerBadgeProps>(
  (
    {
      children,
      className,
      color = "neutral",
      dismissible = false,
      empty = false,
      endIcon,
      highlighted = false,
      icon,
      onDismiss,
      rounded = false,
      size = "medium",
      variant = "solid",
      ...props
    },
    ref
  ) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium",
        rounded ? "rounded-full" : "rounded-md",
        badgeColorClassNames[color][variant],
        empty ? emptySizeClassNames[size] : badgeSizeClassNames[size],
        highlighted && "ring-2 ring-[#753B17]/20",
        className
      )}
      {...props}
    >
      {empty ? null : (
        <>
          {icon}
          {children ? <span>{children}</span> : null}
          {endIcon}
          {dismissible ? (
            <button
              aria-label="Dismiss"
              className="-mr-1 inline-flex size-4 items-center justify-center rounded-full hover:bg-black/10"
              type="button"
              onClick={onDismiss}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </>
      )}
    </span>
  )
);

CareerBadge.displayName = "CareerBadge";

export { CareerBadge };
