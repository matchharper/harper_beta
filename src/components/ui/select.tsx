"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const Select = SelectPrimitive.Root;

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("py-0.5", className)}
      {...props}
    />
  );
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("min-w-0 flex-1 truncate text-left", className)}
      {...props}
    />
  );
}

function SelectTrigger({
  className,
  children,
  size = "default",
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-sm font-normal text-neutral-primary outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:bg-bg-weak focus-visible:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-1000-a05 disabled:cursor-not-allowed disabled:bg-bg-weak disabled:text-neutral-disabled disabled:opacity-70 data-[size=default]:h-10 data-[size=sm]:h-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        data-slot="select-icon"
        render={
          <ChevronDown className="size-4 text-neutral-muted" aria-hidden />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  align = "center",
  alignItemWithTrigger = true,
  alignOffset = 0,
  children,
  className,
  container,
  side = "bottom",
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignItemWithTrigger" | "alignOffset" | "side" | "sideOffset"
  > &
  Pick<SelectPrimitive.Portal.Props, "container">) {
  return (
    <SelectPrimitive.Portal container={container}>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="pointer-events-auto isolate z-120"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative max-h-[min(20rem,var(--available-height))] w-[var(--anchor-width)] min-w-32 origin-[var(--transform-origin)] overflow-x-hidden overflow-y-auto rounded-md border border-neutral-1000-a10 bg-bg-floating p-1 text-neutral-primary shadow-xl outline-none transition-[transform,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        "px-2.5 py-1.5 text-xs font-medium text-neutral-muted",
        className
      )}
      {...props}
    />
  );
}

function SelectItem({
  children,
  className,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded px-2.5 py-2 pr-8 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-bg-weak data-[highlighted]:text-neutral-primary",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex size-4 items-center justify-center text-neutral-primary">
        <Check className="size-4" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "pointer-events-none -mx-1 my-1 h-px bg-neutral-1000-a05",
        className
      )}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "sticky top-0 z-10 flex h-6 w-full cursor-default items-center justify-center bg-bg-floating text-neutral-muted",
        className
      )}
      {...props}
    >
      <ChevronUp className="size-4" aria-hidden />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "sticky bottom-0 z-10 flex h-6 w-full cursor-default items-center justify-center bg-bg-floating text-neutral-muted",
        className
      )}
      {...props}
    >
      <ChevronDown className="size-4" aria-hidden />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
