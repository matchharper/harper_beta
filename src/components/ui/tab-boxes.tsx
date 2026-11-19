"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { badgeVariants } from "@/components/ui/badge";
import { BareButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TabBoxesSize = "xs" | "sm" | "md" | "lg";
export type TabBoxesVariant = "neutral" | "text";

const neutralSelectedBackground = "bg-black";

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
  /** Slide the selected background between single-select neutral tabs. */
  animateSelection?: boolean;
  getItemClassName?: (item: TabBoxItem<T>, selected: boolean) => string;
  itemClassName?: string;
  items: readonly TabBoxItem<T>[];
  listClassName?: string;
  size?: TabBoxesSize;
  variant?: TabBoxesVariant;
} & (
    | {
        selectionMode?: "single";
        activeValue: T;
        activeValues?: never;
        onValueChange: (value: T) => void;
      }
    | {
        selectionMode: "multiple";
        activeValue?: never;
        activeValues: readonly T[];
        onValueChange: (values: T[]) => void;
      }
  );

export function TabBoxes<T extends string>({
  animateSelection = false,
  activeValue,
  activeValues,
  "aria-label": ariaLabel,
  className,
  getItemClassName,
  itemClassName,
  items,
  listClassName,
  onValueChange,
  selectionMode,
  size = "md",
  variant = "neutral",
  ...props
}: TabBoxesProps<T>) {
  const isText = variant === "text";
  const isMultiple = selectionMode === "multiple";
  const selectionId = React.useId();
  const reducedMotion = useReducedMotion();
  const animated = animateSelection && !isText && !isMultiple;

  return (
    <div className={cn("w-full overflow-x-auto", className)} {...props}>
      <div
        role={isMultiple ? "group" : "tablist"}
        aria-label={ariaLabel}
        className={cn("flex min-w-max flex-row gap-2", listClassName)}
      >
        {items.map((item) => {
          const selected = isMultiple
            ? activeValues.includes(item.value)
            : item.value === activeValue;
          const countContent = item.countLabel ?? item.count;

          return (
            <BareButton
              key={item.value}
              type="button"
              data-neutral-tab={!isText || undefined}
              role={isMultiple ? undefined : "tab"}
              data-text-tab={isText || undefined}
              aria-selected={isMultiple ? undefined : selected}
              aria-pressed={isMultiple ? selected : undefined}
              disabled={item.disabled}
              onClick={() => {
                if (isMultiple) {
                  onValueChange(
                    selected
                      ? activeValues.filter((value) => value !== item.value)
                      : items
                          .filter(
                            (option) =>
                              option.value === item.value ||
                              activeValues.includes(option.value)
                          )
                          .map((option) => option.value)
                  );
                } else {
                  onValueChange(item.value);
                }
              }}
              className={cn(
                "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-neutral-1000-a10 disabled:cursor-not-allowed disabled:opacity-55",
                isText
                  ? [
                      "inline-flex min-h-10 items-center justify-center gap-1.5 bg-transparent px-1 text-base font-semibold",
                      selected
                        ? "text-neutral-primary"
                        : "text-neutral-muted hover:text-neutral-primary",
                    ]
                  : [
                      badgeVariants({ size }),
                      "rounded-full font-normal h-8 px-3",
                      selected
                        ? [
                            animated
                              ? "bg-transparent"
                              : neutralSelectedBackground,
                            "text-white",
                          ]
                        : "bg-neutral-1000-a05 text-neutral-primary",
                    ],
                itemClassName,
                getItemClassName?.(item, selected),
                animated && "relative isolate"
              )}
            >
              {animated && selected && (
                <motion.span
                  aria-hidden="true"
                  data-tab-selection
                  layoutId={reducedMotion ? undefined : selectionId}
                  className={cn(
                    "pointer-events-none absolute inset-0 -z-10",
                    neutralSelectedBackground
                  )}
                  style={{ borderRadius: "inherit" }}
                  transition={{
                    duration: reducedMotion ? 0 : 0.28,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              )}
              <span className="min-w-0 truncate">{item.label}</span>
              {countContent != null && (
                <span
                  className={
                    isText
                      ? cn(
                          badgeVariants({
                            variant: "count",
                            size: "sm",
                            radius: "full",
                          }),
                          "min-w-5 bg-neutral-1000-a05 text-[13px] font-semibold leading-none text-inherit shadow-none backdrop-blur-none"
                        )
                      : undefined
                  }
                >
                  {countContent}
                </span>
              )}
            </BareButton>
          );
        })}
      </div>
    </div>
  );
}
