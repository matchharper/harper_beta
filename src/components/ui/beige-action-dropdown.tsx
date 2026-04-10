"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={modal}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "rounded-[12px] border border-beige900/10 bg-beige50 p-1 text-beige900 shadow-[0_18px_40px_rgba(37,20,6,0.12)]",
          contentClassName
        )}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type BeigeActionDropdownItemProps = React.ComponentPropsWithoutRef<
  typeof DropdownMenuItem
> & {
  keepOpen?: boolean;
  selected?: boolean;
};

export const BeigeActionDropdownItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  BeigeActionDropdownItemProps
>(function BeigeActionDropdownItem(
  { children, className, keepOpen = false, onSelect, selected = false, ...props },
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
        "cursor-pointer rounded-[10px] px-3 py-2 text-sm text-beige900 focus:bg-beige200/70 focus:text-beige900",
        selected && "bg-beige200/70",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selected && <Check className="h-4 w-4 text-beige900/70" />}
    </DropdownMenuItem>
  );
});

export const BeigeActionDropdownSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuSeparator>
>(function BeigeActionDropdownSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuSeparator
      ref={ref}
      className={cn("my-1 bg-beige900/10", className)}
      {...props}
    />
  );
});

BeigeActionDropdownItem.displayName = "BeigeActionDropdownItem";
BeigeActionDropdownSeparator.displayName = "BeigeActionDropdownSeparator";
