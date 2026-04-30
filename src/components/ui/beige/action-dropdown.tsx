"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import {
  BeigeDropdownMenu,
  BeigeDropdownMenuContent,
  BeigeDropdownMenuItem,
  BeigeDropdownMenuSeparator,
  BeigeDropdownMenuTrigger,
} from "./dropdown-menu";

type BeigeActionDropdownProps = {
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

export function BeigeActionDropdown({
  trigger,
  children,
  open,
  onOpenChange,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  contentClassName,
  modal,
}: BeigeActionDropdownProps) {
  return (
    <BeigeDropdownMenu open={open} onOpenChange={onOpenChange} modal={modal}>
      <BeigeDropdownMenuTrigger asChild>{trigger}</BeigeDropdownMenuTrigger>
      <BeigeDropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={contentClassName}
      >
        {children}
      </BeigeDropdownMenuContent>
    </BeigeDropdownMenu>
  );
}

type BeigeActionDropdownItemProps = React.ComponentPropsWithoutRef<
  typeof BeigeDropdownMenuItem
> & {
  keepOpen?: boolean;
};

export const BeigeActionDropdownItem = React.forwardRef<
  React.ElementRef<typeof BeigeDropdownMenuItem>,
  BeigeActionDropdownItemProps
>(function BeigeActionDropdownItem(
  { className, keepOpen = false, onSelect, ...props },
  ref
) {
  return (
    <BeigeDropdownMenuItem
      ref={ref}
      onSelect={(event) => {
        if (keepOpen) {
          event.preventDefault();
        }
        onSelect?.(event);
      }}
      className={cn(className)}
      {...props}
    />
  );
});

export const BeigeActionDropdownSeparator = React.forwardRef<
  React.ElementRef<typeof BeigeDropdownMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof BeigeDropdownMenuSeparator>
>(function BeigeActionDropdownSeparator({ className, ...props }, ref) {
  return (
    <BeigeDropdownMenuSeparator ref={ref} className={className} {...props} />
  );
});

BeigeActionDropdownItem.displayName = "BeigeActionDropdownItem";
BeigeActionDropdownSeparator.displayName = "BeigeActionDropdownSeparator";
