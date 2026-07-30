import { Check, ListFilter } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type FilterChipOption<Value extends string = string> = {
  disabled?: boolean;
  label: ReactNode;
  overlay?: ReactNode;
  value: Value;
};

export type FilterChipGroupProps<Value extends string = string> = {
  "aria-label": string;
  className?: string;
  label: ReactNode;
  onValueChange: (value: Value[]) => void;
  options: readonly FilterChipOption<Value>[];
  value: readonly Value[];
};

/**
 * A compact multi-select control for temporarily narrowing a result set.
 * Use a Switch for persistent settings and FilterChipGroup for list filters.
 */
export function FilterChipGroup<Value extends string = string>({
  "aria-label": ariaLabel,
  className,
  label,
  onValueChange,
  options,
  value,
}: FilterChipGroupProps<Value>) {
  const selectedValues = new Set(value);

  const toggleValue = (optionValue: Value) => {
    if (selectedValues.has(optionValue)) {
      onValueChange(value.filter((item) => item !== optionValue));
      return;
    }

    onValueChange([...value, optionValue]);
  };

  return (
    <div
      aria-label={ariaLabel}
      className={cn("flex flex-wrap items-center gap-2", className)}
      role="group"
    >
      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-bg-weak px-2.5 text-[12px] font-medium text-neutral-muted">
        <ListFilter aria-hidden className="size-3.5" strokeWidth={2} />
        <span>{label}</span>
        {value.length > 0 ? (
          <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-neutral-00">
            {value.length}
          </span>
        ) : null}
      </span>

      {options.map((option) => {
        const selected = selectedValues.has(option.value);

        return (
          <button
            aria-pressed={selected}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 text-[13px] font-medium outline-none transition-[background-color,border-color,color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
              option.overlay && "relative isolate overflow-hidden",
              selected
                ? "border-primary/25 bg-primary-faded text-primary hover:border-primary/40 hover:bg-accent-200/55"
                : "border-neutral-1000-a10 bg-bg-floating text-neutral-primary hover:border-neutral-400 hover:bg-bg-weak"
            )}
            disabled={option.disabled}
            key={option.value}
            onClick={() => toggleValue(option.value)}
            type="button"
          >
            {option.overlay}
            {selected ? (
              <Check
                aria-hidden
                className="relative z-20 size-3.5"
                strokeWidth={2.5}
              />
            ) : null}
            <span className="relative z-20">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
