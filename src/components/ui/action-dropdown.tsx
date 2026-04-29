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
          "rounded-[10px] border border-beige900/8 bg-beige50/95 p-1 text-beige900 shadow-[0_18px_40px_rgba(0,0,0,0.12)] backdrop-blur-md",
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
  tone?: "default" | "danger";
  keepOpen?: boolean;
};

export const ActionDropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  ActionDropdownItemProps
>(function ActionDropdownItem(
  { className, tone = "default", keepOpen = false, onSelect, ...props },
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
      className={cn(
        "cursor-pointer rounded-[10px] px-3 py-2 text-sm text-beige900 focus:bg-beige500/55 focus:text-beige900",
        tone === "danger" && "text-red-600 focus:bg-red-400/15 focus:text-red-700",
        className
      )}
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
      className={cn("my-1 bg-beige900/8", className)}
      {...props}
    />
  );
});

ActionDropdownItem.displayName = "ActionDropdownItem";
ActionDropdownSeparator.displayName = "ActionDropdownSeparator";
