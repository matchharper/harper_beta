"use client";

import * as React from "react";
import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TabBoxesSize = "xs" | "sm" | "md" | "lg";

export type TabBoxItem<T extends string> = {
  count?: React.ReactNode;
  countLabel?: React.ReactNode;
  disabled?: boolean;
  label: React.ReactNode;
  value: T;
};

export type TabBoxesProps<T extends string> = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> & {
  activeValue: T;
  getItemClassName?: (item: TabBoxItem<T>, selected: boolean) => string;
  itemClassName?: string;
  items: readonly TabBoxItem<T>[];
  listClassName?: string;
  onValueChange: (value: T) => void;
  size?: TabBoxesSize;
};

const tabBoxSizeClassNames: Record<TabBoxesSize, string> = {
  xs: "min-h-10 min-w-[104px] px-3 py-2",
  sm: "min-h-12 min-w-[132px] px-3 py-2.5",
  md: "min-h-16 min-w-48 px-4 py-3",
  lg: "min-h-20 min-w-56 px-5 py-4",
};

const tabBoxLabelClassNames: Record<TabBoxesSize, string> = {
  xs: "text-[13px] leading-4",
  sm: "text-[13px] leading-5",
  md: "text-sm leading-5",
  lg: "text-[15px] leading-5",
};

const tabBoxCountClassNames: Record<TabBoxesSize, string> = {
  xs: "text-[10px] leading-3",
  sm: "text-[11px] leading-4",
  md: "text-xs leading-4",
  lg: "text-xs leading-4",
};

export function TabBoxes<T extends string>({
  activeValue,
  className,
  getItemClassName,
  itemClassName,
  items,
  listClassName,
  onValueChange,
  size = "md",
  ...props
}: TabBoxesProps<T>) {
  return (
    <div className={cn("w-full overflow-x-auto", className)} {...props}>
      <div
        role="tablist"
        className={cn("flex min-w-max flex-row gap-2", listClassName)}
      >
        {items.map((item) => {
          const selected = item.value === activeValue;
          const countContent = item.countLabel ?? item.count;

          return (
            <BareButton
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={item.disabled}
              onClick={() => onValueChange(item.value)}
              className={cn(
                "flex items-center justify-between rounded-md border-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55",
                tabBoxSizeClassNames[size],
                selected
                  ? "border-primary bg-bg-floating text-primary"
                  : "border-neutral-1000-a05 bg-bg-floating text-neutral-muted hover:border-primary hover:text-primary",
                itemClassName,
                getItemClassName?.(item, selected)
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "min-w-0 truncate font-medium",
                    tabBoxLabelClassNames[size]
                  )}
                >
                  {item.label}
                </span>
                {countContent != null ? (
                  <span className={cn(tabBoxCountClassNames[size])}>
                    {countContent}
                  </span>
                ) : null}
              </div>
            </BareButton>
          );
        })}
      </div>
    </div>
  );
}
