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
            "flex h-8 w-full items-center justify-between gap-2 rounded-control border-(length:--control-border-width) border-control-border bg-control bg-control-image text-control-foreground shadow-(--shadow-control) backdrop-blur-control px-2.5 text-[13px] font-control outline-none hover:bg-bg-weak focus-visible:border-stroke-focus focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:bg-control-disabled disabled:text-neutral-disabled disabled:opacity-70",
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
            "z-120 max-h-(--radix-dropdown-menu-content-available-height) w-[var(--radix-dropdown-menu-trigger-width)] min-w-28 overflow-x-hidden overflow-y-auto rounded-menu border-(length:--menu-border-width) border-menu-border bg-menu bg-menu-image text-menu-foreground shadow-(--shadow-menu) backdrop-blur-menu p-0.5 outline-none",
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
                className="relative flex min-h-7 cursor-default select-none items-center rounded-menu-item py-1 pl-2 pr-7 text-xs leading-4 text-menu-foreground outline-none focus:bg-menu-hover data-disabled:pointer-events-none data-disabled:opacity-50"
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
