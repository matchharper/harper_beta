"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

type ActionDropdownProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  contentClassName?: string;
  modal?: boolean;
};

export function ActionDropdown({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  contentClassName,
  modal,
}: ActionDropdownProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "rounded-[12px] border border-neutral-1000-a05 bg-bg-floating/95 p-1 text-neutral-primary shadow-[0_18px_40px_rgba(31,28,26,0.12)] backdrop-blur-md",
          contentClassName
        )}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ActionDropdownItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuItem
> & {
  keepOpen?: boolean;
  selected?: boolean;
  tone?: "default" | "danger";
};

export const ActionDropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  ActionDropdownItemProps
>(function ActionDropdownItem(
  {
    className,
    keepOpen = false,
    onSelect,
    selected = false,
    tone = "default",
    ...props
  },
  ref
) {
  return (
    <DropdownMenuItem
      ref={ref}
      onSelect={(event) => {
        if (keepOpen) {
          event.preventDefault();
        }
        onSelect?.(event);
      }}
      className={cn("cursor-pointer", className)}
      selected={selected}
      tone={tone}
      {...props}
    />
  );
});

export const ActionDropdownSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuSeparator>
>(function ActionDropdownSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuSeparator
      ref={ref}
      className={cn("my-1 bg-neutral-1000-a05", className)}
      {...props}
    />
  );
});

ActionDropdownItem.displayName = "ActionDropdownItem";
ActionDropdownSeparator.displayName = "ActionDropdownSeparator";
