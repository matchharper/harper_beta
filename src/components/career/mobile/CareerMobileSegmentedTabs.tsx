"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type SegmentedTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

type CareerMobileSegmentedTabsProps<T extends string> = {
  items: SegmentedTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
};

export default function CareerMobileSegmentedTabs<T extends string>({
  items,
  activeId,
  onChange,
  className,
}: CareerMobileSegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex items-stretch gap-1 border-b border-beige900/10 bg-beige100 px-3 py-2",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors",
              active
                ? "bg-white text-beige900 shadow-[0_1px_2px_rgba(46,23,6,0.06)]"
                : "text-beige900/55 hover:text-beige900/80"
            )}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" && item.count > 0 ? (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1.5 text-[11px] font-medium leading-none",
                  active
                    ? "bg-beige900/8 text-beige900/70"
                    : "bg-beige900/8 text-beige900/55"
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
