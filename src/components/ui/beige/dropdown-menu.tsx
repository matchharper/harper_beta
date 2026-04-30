"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DropdownMenu as BaseDropdownMenu,
  DropdownMenuCheckboxItem as BaseDropdownMenuCheckboxItem,
  DropdownMenuContent as BaseDropdownMenuContent,
  DropdownMenuGroup as BaseDropdownMenuGroup,
  DropdownMenuItem as BaseDropdownMenuItem,
  DropdownMenuLabel as BaseDropdownMenuLabel,
  DropdownMenuPortal as BaseDropdownMenuPortal,
  DropdownMenuRadioGroup as BaseDropdownMenuRadioGroup,
  DropdownMenuRadioItem as BaseDropdownMenuRadioItem,
  DropdownMenuSeparator as BaseDropdownMenuSeparator,
  DropdownMenuShortcut as BaseDropdownMenuShortcut,
  DropdownMenuSub as BaseDropdownMenuSub,
  DropdownMenuSubContent as BaseDropdownMenuSubContent,
  DropdownMenuSubTrigger as BaseDropdownMenuSubTrigger,
  DropdownMenuTrigger as BaseDropdownMenuTrigger,
} from "../dropdown-menu";

export const beigeDropdownContentClassName =
  "rounded-[12px] border border-beige900/10 bg-beige50 p-1 text-beige900 shadow-[0_18px_40px_rgba(37,20,6,0.1)]";

export const beigeDropdownItemClassName =
  "cursor-pointer rounded-[10px] px-3 py-2 text-sm text-beige900 focus:bg-beige200/70 focus:text-beige900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

const BeigeDropdownMenu = BaseDropdownMenu;
const BeigeDropdownMenuTrigger = BaseDropdownMenuTrigger;
const BeigeDropdownMenuGroup = BaseDropdownMenuGroup;
const BeigeDropdownMenuPortal = BaseDropdownMenuPortal;
const BeigeDropdownMenuSub = BaseDropdownMenuSub;
const BeigeDropdownMenuRadioGroup = BaseDropdownMenuRadioGroup;
const BeigeDropdownMenuShortcut = BaseDropdownMenuShortcut;

const BeigeDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuContent>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuContent>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuContent
    ref={ref}
    className={cn(beigeDropdownContentClassName, className)}
    {...props}
  />
));
BeigeDropdownMenuContent.displayName = "BeigeDropdownMenuContent";

const BeigeDropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuSubContent>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuSubContent>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuSubContent
    ref={ref}
    className={cn(beigeDropdownContentClassName, className)}
    {...props}
  />
));
BeigeDropdownMenuSubContent.displayName = "BeigeDropdownMenuSubContent";

const BeigeDropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuSubTrigger>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuSubTrigger>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuSubTrigger
    ref={ref}
    className={cn(
      "rounded-[10px] text-beige900 focus:bg-beige200/70 data-[state=open]:bg-beige200/70",
      className
    )}
    {...props}
  />
));
BeigeDropdownMenuSubTrigger.displayName = "BeigeDropdownMenuSubTrigger";

type BeigeDropdownMenuItemProps = React.ComponentPropsWithoutRef<
  typeof BaseDropdownMenuItem
> & {
  selected?: boolean;
  tone?: "default" | "danger";
};

const BeigeDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuItem>,
  BeigeDropdownMenuItemProps
>(
  (
    { children, className, selected = false, tone = "default", ...props },
    ref
  ) => (
    <BaseDropdownMenuItem
      ref={ref}
      className={cn(
        beigeDropdownItemClassName,
        selected && "bg-beige200/70",
        tone === "danger" && "text-red-700 focus:bg-red-50 focus:text-red-700",
        className
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {selected ? <Check className="h-4 w-4 text-beige900/70" /> : null}
    </BaseDropdownMenuItem>
  )
);
BeigeDropdownMenuItem.displayName = "BeigeDropdownMenuItem";

const BeigeDropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuCheckboxItem>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuCheckboxItem>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuCheckboxItem
    ref={ref}
    className={cn(
      "rounded-[10px] text-beige900 focus:bg-beige200/70 focus:text-beige900",
      className
    )}
    {...props}
  />
));
BeigeDropdownMenuCheckboxItem.displayName = "BeigeDropdownMenuCheckboxItem";

const BeigeDropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuRadioItem>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuRadioItem>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuRadioItem
    ref={ref}
    className={cn(
      "rounded-[10px] text-beige900 focus:bg-beige200/70 focus:text-beige900",
      className
    )}
    {...props}
  />
));
BeigeDropdownMenuRadioItem.displayName = "BeigeDropdownMenuRadioItem";

const BeigeDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuLabel>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuLabel>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuLabel
    ref={ref}
    className={cn("text-beige900/60", className)}
    {...props}
  />
));
BeigeDropdownMenuLabel.displayName = "BeigeDropdownMenuLabel";

const BeigeDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof BaseDropdownMenuSeparator>,
  React.ComponentPropsWithoutRef<typeof BaseDropdownMenuSeparator>
>(({ className, ...props }, ref) => (
  <BaseDropdownMenuSeparator
    ref={ref}
    className={cn("my-1 bg-beige900/10", className)}
    {...props}
  />
));
BeigeDropdownMenuSeparator.displayName = "BeigeDropdownMenuSeparator";

export {
  BeigeDropdownMenu,
  BeigeDropdownMenuCheckboxItem,
  BeigeDropdownMenuContent,
  BeigeDropdownMenuGroup,
  BeigeDropdownMenuItem,
  BeigeDropdownMenuLabel,
  BeigeDropdownMenuPortal,
  BeigeDropdownMenuRadioGroup,
  BeigeDropdownMenuRadioItem,
  BeigeDropdownMenuSeparator,
  BeigeDropdownMenuShortcut,
  BeigeDropdownMenuSub,
  BeigeDropdownMenuSubContent,
  BeigeDropdownMenuSubTrigger,
  BeigeDropdownMenuTrigger,
  BeigeDropdownMenu as DropdownMenu,
  BeigeDropdownMenuCheckboxItem as DropdownMenuCheckboxItem,
  BeigeDropdownMenuContent as DropdownMenuContent,
  BeigeDropdownMenuGroup as DropdownMenuGroup,
  BeigeDropdownMenuItem as DropdownMenuItem,
  BeigeDropdownMenuLabel as DropdownMenuLabel,
  BeigeDropdownMenuPortal as DropdownMenuPortal,
  BeigeDropdownMenuRadioGroup as DropdownMenuRadioGroup,
  BeigeDropdownMenuRadioItem as DropdownMenuRadioItem,
  BeigeDropdownMenuSeparator as DropdownMenuSeparator,
  BeigeDropdownMenuShortcut as DropdownMenuShortcut,
  BeigeDropdownMenuSub as DropdownMenuSub,
  BeigeDropdownMenuSubContent as DropdownMenuSubContent,
  BeigeDropdownMenuSubTrigger as DropdownMenuSubTrigger,
  BeigeDropdownMenuTrigger as DropdownMenuTrigger,
};
