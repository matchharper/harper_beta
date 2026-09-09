"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type CompactDropdownOption<T extends string> = {
  disabled?: boolean;
  label: ReactNode;
  value: T;
};

type CompactDropdownProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
  onValueChange: (value: T) => void;
  options: readonly CompactDropdownOption<T>[];
  value: T;
};

export function CompactDropdown<T extends string>({
  ariaLabel,
  className,
  contentClassName,
  disabled = false,
  id,
  onValueChange,
  options,
  value,
}: CompactDropdownProps<T>) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 text-[13px] font-normal text-neutral-primary outline-none hover:bg-bg-weak focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:opacity-70",
            className
          )}
        >
          <span className="min-w-0 truncate">{selectedOption?.label}</span>
          <ChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 text-neutral-muted"
          />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-120 max-h-(--radix-dropdown-menu-content-available-height) w-[var(--radix-dropdown-menu-trigger-width)] min-w-28 overflow-x-hidden overflow-y-auto rounded-lg border border-neutral-1000-a05 bg-bg-floating p-0.5 text-neutral-primary shadow-lg outline-none",
            contentClassName
          )}
        >
          <DropdownMenuPrimitive.RadioGroup
            value={value}
            onValueChange={(nextValue) => {
              const option = options.find(
                (candidate) => candidate.value === nextValue
              );
              if (option && !option.disabled) onValueChange(option.value);
            }}
          >
            {options.map((option) => (
              <DropdownMenuPrimitive.RadioItem
                key={option.value}
                disabled={option.disabled}
                value={option.value}
                className="relative flex min-h-7 cursor-default select-none items-center rounded-md py-1 pl-2 pr-7 text-xs leading-4 text-neutral-primary outline-none focus:bg-bg-weak data-disabled:pointer-events-none data-disabled:opacity-50"
              >
                <span className="min-w-0 truncate">{option.label}</span>
                <DropdownMenuPrimitive.ItemIndicator className="absolute right-2 inline-flex size-3.5 items-center justify-center">
                  <Check aria-hidden="true" className="size-3.5" />
                </DropdownMenuPrimitive.ItemIndicator>
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
