"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export type TabsVariant =
  | "bordered"
  | "cards"
  | "pills"
  | "pills-elevated"
  | "borderless";
export type TabsDirection = "row" | "column";
export type TabsSize = "medium" | "large";

export interface TabItem {
  disabled?: boolean;
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: string;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  activeValue?: string;
  defaultValue?: string;
  direction?: TabsDirection;
  itemWidth?: "auto" | "equal";
  items: TabItem[];
  onValueChange?: (value: string) => void;
  size?: TabsSize;
  variant?: TabsVariant;
}

const tabSizeClassNames: Record<TabsSize, string> = {
  medium: "h-9 text-[14px] leading-[22px]",
  large: "h-11 text-[16px] leading-6",
};

const Tabs = React.forwardRef<HTMLDivElement, TabsProps>(
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
              ? "gap-6 border-b border-neutral-1000-a05"
              : "gap-1 border-l border-neutral-1000-a05"),
          variant !== "bordered" && (direction === "row" ? "gap-1" : "gap-1"),
          variant === "pills-elevated" &&
            "rounded-lg bg-bg-weak p-1 ring-1 ring-neutral-1000-a05",
          variant === "pills" && "rounded-lg bg-bg-weak p-1",
          variant === "cards" &&
            (direction === "row"
              ? "w-fit gap-1.5"
              : "w-[200px] gap-1.5 border-l-0"),
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
                "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[background-color,color,opacity] focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:pointer-events-none disabled:opacity-40",
                tabSizeClassNames[size],
                itemWidth === "equal" && "flex-1",
                direction === "row" ? "px-0" : "w-full justify-start px-3",
                variant === "bordered" &&
                  (direction === "row" ? "pb-0" : "pl-3"),
                variant === "borderless" &&
                  "rounded-md px-2 text-neutral-muted hover:bg-bg-weak",
                (variant === "pills" || variant === "pills-elevated") &&
                  "rounded-md px-3 text-neutral-muted hover:bg-bg-floating",
                variant === "cards" &&
                  "rounded-md border-2 border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-primary hover:text-primary",
                variant === "cards" &&
                  (size === "large" ? "min-w-[156px] px-6" : "min-w-28 px-4"),
                selected ? "text-neutral-primary" : "text-neutral-muted",
                selected &&
                  (variant === "pills" || variant === "pills-elevated") &&
                  "bg-bg-floating text-neutral-primary",
                selected && variant === "cards" && "border-primary text-primary"
              )}
              onClick={() => handleChange(item.value)}
            >
              {direction === "column" && variant === "bordered" && selected ? (
                <span className="absolute bottom-0 left-0 top-0 w-0.5 rounded-full bg-neutral-800" />
              ) : null}
              {item.icon}
              <span>{item.label}</span>
              {direction === "row" && variant === "bordered" && selected ? (
                <span className="absolute bottom-[-1px] left-0 right-0 h-0.5 rounded-full bg-neutral-800" />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }
);
Tabs.displayName = "Tabs";

export { Tabs };
