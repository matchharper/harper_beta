"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Radio } from "@/components/ui/radio";
import { cn } from "@/lib/cn";

export type SelectBoxOption<Value extends string = string> = {
  value: Value;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type SelectBoxProps<Value extends string = string> = Omit<
  ComponentPropsWithoutRef<"fieldset">,
  "onChange" | "children"
> & {
  options: readonly SelectBoxOption<Value>[];
  value: Value | null;
  onValueChange: (value: Value) => void;
  name?: string;
  required?: boolean;
};

/** A single-choice list. Supply an aria-label or aria-labelledby for the group. */
export function SelectBox<Value extends string = string>({
  options,
  value,
  onValueChange,
  name,
  required,
  className,
  ...props
}: SelectBoxProps<Value>) {
  const id = useId();
  return (
    <fieldset
      className={cn(
        "min-w-0 rounded-card border-0 bg-card-selected px-5 disabled:opacity-50",
        className
      )}
      {...props}
    >
      {options.map((option, index) => (
        <label
          key={option.value}
          className={cn(
            "relative flex cursor-pointer items-center font-normal gap-5 py-4 transition duration-250 ease-out active:scale-[0.98] hover:opacity-85 active:opacity-70 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-neutral-disabled has-[:disabled]:active:scale-100 has-[:disabled]:active:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none",
            index > 0 && "border-t border-neutral-1000-a05"
          )}
        >
          <span className="min-w-0 flex-1">
            <span
              id={`${id}-${index}-title`}
              className="block text-sm leading-6 text-neutral-primary"
            >
              {option.title}
            </span>
            {option.description != null ? (
              <span
                id={`${id}-${index}-description`}
                className="mt-0.5 block whitespace-pre-line text-[13px] leading-5 text-neutral-600"
              >
                {option.description}
              </span>
            ) : null}
          </span>
          <span className="relative size-5 shrink-0">
            <Radio
              unstyled
              name={name ?? id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onValueChange(option.value)}
              disabled={option.disabled}
              required={required}
              aria-labelledby={`${id}-${index}-title`}
              aria-describedby={
                option.description != null
                  ? `${id}-${index}-description`
                  : undefined
              }
              className="peer absolute inset-0 size-5 appearance-none rounded-full border border-neutral-500 bg-transparent outline-none checked:border-control-checked checked:bg-control-checked focus-visible:ring-2 focus-visible:ring-neutral-800 focus-visible:ring-offset-2 disabled:opacity-50"
            />
            <Check
              aria-hidden="true"
              strokeWidth={3}
              className="pointer-events-none absolute inset-0.5 size-4 text-control-mark opacity-0 peer-checked:opacity-100"
            />
          </span>
        </label>
      ))}
    </fieldset>
  );
}
