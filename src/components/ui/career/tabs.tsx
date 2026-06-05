"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type CareerTabsVariant =
  | "bordered"
  | "pills"
  | "pills-elevated"
  | "borderless";
export type CareerTabsDirection = "row" | "column";
export type CareerTabsSize = "medium" | "large";

export interface CareerTabItem {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: string;
}

export interface CareerTabsProps extends React.HTMLAttributes<HTMLDivElement> {
  activeValue?: string;
  defaultValue?: string;
  direction?: CareerTabsDirection;
  itemWidth?: "auto" | "equal";
  items: CareerTabItem[];
  onValueChange?: (value: string) => void;
  size?: CareerTabsSize;
  variant?: CareerTabsVariant;
}

const tabSizeClassNames: Record<CareerTabsSize, string> = {
  medium: "h-9 text-[14px] leading-[22px]",
  large: "h-11 text-[16px] leading-6",
};

const CareerTabs = React.forwardRef<HTMLDivElement, CareerTabsProps>(
  (
    {
      activeValue,
      className,
      defaultValue,
      direction = "row",
      itemWidth = "auto",
      items,
      onValueChange,
      size = "medium",
      variant = "bordered",
      ...props
    },
    ref
  ) => {
    const isControlled = activeValue !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      defaultValue ?? items[0]?.value
    );
    const resolvedValue = isControlled ? activeValue : uncontrolledValue;

    const handleChange = React.useCallback(
      (value: string) => {
        if (!isControlled) setUncontrolledValue(value);
        onValueChange?.(value);
      },
      [isControlled, onValueChange]
    );

    return (
      <div
        ref={ref}
        role="tablist"
        aria-orientation={direction === "column" ? "vertical" : "horizontal"}
        className={cn(
          "flex",
          direction === "row" ? "w-full flex-row" : "w-[200px] flex-col",
          variant === "bordered" &&
            (direction === "row"
              ? "gap-6 border-b border-[#ECE9E5]"
              : "gap-1 border-l border-[#ECE9E5]"),
          variant !== "bordered" && (direction === "row" ? "gap-1" : "gap-1"),
          variant === "pills-elevated" &&
            "rounded-lg bg-white p-1 shadow-sm ring-1 ring-[#1F1C1A0D]",
          variant === "pills" && "rounded-lg bg-[#F8F7F5] p-1",
          className
        )}
        {...props}
      >
        {items.map((item) => {
          const selected = item.value === resolvedValue;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={item.disabled}
              className={cn(
                "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[background-color,color,opacity] focus-visible:ring-2 focus-visible:ring-[#753B17]/25 disabled:pointer-events-none disabled:opacity-40",
                tabSizeClassNames[size],
                itemWidth === "equal" && "flex-1",
                direction === "row" ? "px-0" : "w-full justify-start px-3",
                variant === "bordered" &&
                  (direction === "row" ? "pb-0" : "pl-3"),
                variant === "borderless" &&
                  "rounded-md px-2 text-[#827B75] hover:bg-[#F8F7F5]",
                (variant === "pills" || variant === "pills-elevated") &&
                  "rounded-md px-3 text-[#827B75] hover:bg-white/70",
                selected ? "text-[#1F1C1A]" : "text-[#827B75]",
                selected &&
                  (variant === "pills" || variant === "pills-elevated") &&
                  "bg-white text-[#1F1C1A] shadow-sm"
              )}
              onClick={() => handleChange(item.value)}
            >
              {direction === "column" && variant === "bordered" && selected ? (
                <span className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-[#753B1766]" />
              ) : null}
              {item.icon}
              <span>{item.label}</span>
              {direction === "row" && variant === "bordered" && selected ? (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full bg-[#753B1766]" />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }
);

CareerTabs.displayName = "CareerTabs";

export { CareerTabs };
