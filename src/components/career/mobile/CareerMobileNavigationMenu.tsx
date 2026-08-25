"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CareerMobileNavigationOptionId =
  | CareerWorkspaceTab
  | "inbox"
  | "jobs";

export type CareerMobileNavigationOption = {
  badgeCount?: number;
  id: CareerMobileNavigationOptionId;
  label: string;
  icon?: LucideIcon;
};

type CareerMobileNavigationMenuProps = {
  activeTab: CareerMobileNavigationOptionId;
  align?: "start" | "center" | "end";
  children: ReactNode;
  contentClassName?: string;
  onChangeTab: (tab: CareerMobileNavigationOptionId) => void;
  options: CareerMobileNavigationOption[];
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
};

export default function CareerMobileNavigationMenu({
  activeTab,
  align = "start",
  children,
  contentClassName,
  onChangeTab,
  options,
  side = "bottom",
  sideOffset = 4,
}: CareerMobileNavigationMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "min-w-[196px] rounded-xl p-1 text-neutral-primary",
          contentClassName
        )}
      >
        {options.map((option) => {
          const Icon = option.icon;
          const active = option.id === activeTab;
          const badgeCount = option.badgeCount ?? 0;

          return (
            <DropdownMenuItem
              key={option.id}
              data-career-topbar-option-id={option.id}
              onSelect={() => onChangeTab(option.id)}
              selected={active}
              className="cursor-pointer rounded-lg px-2.5 py-2.5 text-sm text-neutral-primary focus:bg-bg-weak/70 focus:text-neutral-primary"
            >
              {Icon ? (
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-neutral-muted">
                  <Icon className="h-4 w-4" />
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {badgeCount > 0 ? (
                <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-action px-2.5 text-[11px] leading-none text-neutral-00">
                  {badgeCount}
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
