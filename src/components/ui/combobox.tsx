"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({
  className,
  disabled = false,
  showClear = false,
  showTrigger = true,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showClear?: boolean;
  showTrigger?: boolean;
}) {
  return (
    <ComboboxPrimitive.InputGroup
      className={cn(
        "flex h-11 w-full items-center rounded-md border border-neutral-1000-a05 bg-bg-default/80 transition focus-within:border-neutral-1000-a10 focus-within:bg-bg-default",
        className
      )}
    >
      <ComboboxPrimitive.Input
        disabled={disabled}
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-neutral-primary outline-none placeholder:text-neutral-placeholder disabled:cursor-not-allowed disabled:text-neutral-disabled"
        {...props}
      />
      <div className="flex h-full shrink-0 items-center gap-0.5 pr-1.5">
        {showClear ? (
          <ComboboxPrimitive.Clear
            aria-label="Clear selection"
            disabled={disabled}
            className="inline-flex size-7 items-center justify-center rounded text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="size-3.5" />
          </ComboboxPrimitive.Clear>
        ) : null}
        {showTrigger ? (
          <ComboboxPrimitive.Trigger
            aria-label="Open options"
            disabled={disabled}
            className="inline-flex size-7 items-center justify-center rounded text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:pointer-events-none disabled:opacity-50"
          >
            <ChevronDown className="size-4" />
          </ComboboxPrimitive.Trigger>
        ) : null}
      </div>
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  align = "start",
  alignOffset = 0,
  anchor,
  className,
  container,
  side = "bottom",
  sideOffset = 6,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  > &
  Pick<ComboboxPrimitive.Portal.Props, "container">) {
  return (
    <ComboboxPrimitive.Portal container={container}>
      <ComboboxPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        className="pointer-events-auto isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "max-h-[min(20rem,var(--available-height))] w-[var(--anchor-width)] min-w-56 origin-[var(--transform-origin)] overflow-hidden rounded-md border border-neutral-1000-a10 bg-bg-floating p-1 text-neutral-primary shadow-xl outline-none transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[19rem] overflow-y-auto overscroll-contain py-0.5",
        className
      )}
      {...props}
    />
  );
}

function ComboboxItem({
  children,
  className,
  ...props
}: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded px-2.5 py-2 pr-8 text-sm outline-none data-[highlighted]:bg-bg-weak data-[highlighted]:text-neutral-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ComboboxPrimitive.ItemIndicator className="absolute right-2 inline-flex size-4 items-center justify-center text-neutral-primary">
        <Check className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "px-3 py-6 text-center text-sm text-neutral-muted",
        className
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
};
