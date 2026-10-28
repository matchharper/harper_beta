"use client";

import { type ComponentType, type ReactNode } from "react";
import Image from "next/image";
import { PanelLeftClose } from "lucide-react";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  PushNavigationContent,
  usePushNavigation,
} from "@/components/ui/push-navigation";
export { PushNavigationFrame as CareerMobileNavigationFrame } from "@/components/ui/push-navigation";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";

export type CareerMobileNavigationOptionId =
  | CareerWorkspaceTab
  | "inbox"
  | "jobs";

export type CareerMobileNavigationOption = {
  badgeCount?: number;
  badgeClassName?: string;
  id: CareerMobileNavigationOptionId;
  label: string;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
};

type CareerMobileNavigationMenuProps = {
  activeTab: CareerMobileNavigationOptionId;
  children: ReactNode;
  onChangeTab: (tab: CareerMobileNavigationOptionId) => void;
  options: CareerMobileNavigationOption[];
};

export default function CareerMobileNavigationMenu({
  activeTab,
  children,
  onChangeTab,
  options,
}: CareerMobileNavigationMenuProps) {
  const t = useCareerT();
  const { open, setOpen } = usePushNavigation();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <PushNavigationContent className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <DialogTitle className="sr-only">Career</DialogTitle>
        <div className="mb-4 flex h-9 shrink-0 items-center justify-between pl-2.5">
          <Image
            alt="Harper"
            src="/svgs/logov2.svg"
            width={48}
            height={24}
            className="h-auto w-16"
          />
          <DialogClose asChild>
            <MuteButton
              variant="transparent"
              aria-label={t("career.workspace.collapse_sidebar", "메뉴 접기")}
            >
              <PanelLeftClose
                aria-hidden
                className="size-5"
                strokeWidth={1.5}
              />
            </MuteButton>
          </DialogClose>
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto"
          aria-label="Career"
        >
          {options.map((option) => {
            const Icon = option.icon;
            const active = option.id === activeTab;
            const badgeCount = option.badgeCount ?? 0;

            return (
              <MuteButton
                key={option.id}
                variant="transparent"
                aria-current={active ? "page" : undefined}
                data-career-topbar-option-id={option.id}
                onClick={() => {
                  setOpen(false);
                  onChangeTab(option.id);
                }}
                className={cn(
                  "flex h-11 w-full items-center justify-start gap-2.5 rounded-md px-2.5 text-[14.5px] font-normal text-neutral-primary",
                  active &&
                    "bg-neutral-300/70 text-neutral-primary hover:bg-neutral-200"
                )}
              >
                {Icon ? (
                  <Icon
                    className="size-5 shrink-0"
                    strokeWidth={option.id === "home" ? undefined : 1.5}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-left">
                  {option.label}
                </span>
                {badgeCount > 0 ? (
                  <Badge
                    className={cn(
                      "min-w-5 bg-primary-faded font-normal tabular-nums text-primary",
                      option.badgeClassName
                    )}
                    radius="full"
                    size="sm"
                  >
                    {option.id === "inbox" && badgeCount >= 99
                      ? "99+"
                      : badgeCount}
                  </Badge>
                ) : null}
              </MuteButton>
            );
          })}
        </nav>
      </PushNavigationContent>
    </Dialog>
  );
}
