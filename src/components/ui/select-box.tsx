"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Radio } from "@/components/ui/radio";
import { GroupedList, GroupedListRow, GroupedListText } from "./grouped-list";

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
    <GroupedList asChild className={className}>
      <fieldset className="border-0 disabled:opacity-50" {...props}>
        {options.map((option, index) => (
          <GroupedListRow key={option.value} asChild className="py-4 text-sm">
            <label className="cursor-pointer transition duration-250 ease-out active:scale-[0.98] hover:opacity-85 active:opacity-70 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-neutral-disabled has-[:disabled]:active:scale-100 has-[:disabled]:active:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none">
              <GroupedListText
                title={option.title}
                description={option.description}
                titleId={`${id}-${index}-title`}
                descriptionId={`${id}-${index}-description`}
              />
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
          </GroupedListRow>
        ))}
      </fieldset>
    </GroupedList>
  );
}
