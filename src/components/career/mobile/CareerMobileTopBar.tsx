"use client";

import React from "react";
import { Check, ChevronDown, HelpCircle, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import CareerProfileMenu from "@/components/career/CareerProfileMenu";

type TabOption = {
  badgeCount?: number;
  id: CareerWorkspaceTab;
  label: string;
  icon?: LucideIcon;
};

type CareerMobileTopBarProps = {
  activeTab: CareerWorkspaceTab;
  options: TabOption[];
  onChangeTab: (tab: CareerWorkspaceTab) => void;
  profilePicture?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onLogout?: () => void | Promise<void>;
  className?: string;
};

export default function CareerMobileTopBar({
  activeTab,
  options,
  onChangeTab,
  profilePicture,
  userName,
  userEmail,
  onOpenSettings,
  onOpenSupport,
  onLogout,
  className,
}: CareerMobileTopBarProps) {
  const activeOption =
    options.find((opt) => opt.id === activeTab) ?? options[0];
  const ActiveIcon = activeOption?.icon;
  const activeBadgeCount = activeOption?.badgeCount ?? 0;
  const todayLabel = React.useMemo(
    () => formatKoreanTodayLabel(new Date()),
    []
  );
  const showHomeDate = activeTab === "home";

  return (
    <header
      className={cn(
        "relative flex h-14 items-center justify-between px-2 text-beige900 backdrop-blur-xl",
        className
      )}
    >
      {showHomeDate ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[14px] font-normal text-beige900/40">
          {todayLabel}
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative z-10 inline-flex h-11 max-w-[180px] items-center gap-1 rounded-md px-2.5 text-base font-medium text-beige900 transition active:bg-beige900/5"
          >
            {ActiveIcon && (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-beige900">
                <ActiveIcon className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 truncate">{activeOption?.label}</span>
            {activeBadgeCount > 0 ? (
              <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-beige900 text-[11px] leading-none text-beige50">
                {activeBadgeCount}
              </span>
            ) : null}
            <ChevronDown className="h-5 w-5 shrink-0 text-beige900/55" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="min-w-[196px] rounded-xl p-1 text-beige900"
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = opt.id === activeTab;
            const badgeCount = opt.badgeCount ?? 0;

            return (
              <DropdownMenuItem
                key={opt.id}
                onSelect={() => onChangeTab(opt.id)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2.5 text-sm text-beige900 focus:bg-beige200/70 focus:text-beige900",
                  active && "bg-beige200/70 font-medium"
                )}
              >
                {Icon && (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-beige900/75">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {badgeCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-beige900 px-1.5 text-[11px] leading-none text-beige50">
                    {badgeCount}
                  </span>
                ) : null}
                {active && (
                  <Check className="h-4 w-4 shrink-0 text-beige900/70" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="relative z-10 flex items-center gap-0">
        <IconButton
          ariaLabel="설정"
          onClick={onOpenSettings}
          icon={<Settings className="h-5 w-5" />}
        />
        {onLogout && (
          <CareerProfileMenu
            variant="mobile"
            profileImageUrl={profilePicture ?? null}
            profileName={userName ?? "Candidate"}
            profileEmail={userEmail ?? ""}
            onLogout={onLogout}
            onSuggestUpdate={() => onOpenSupport?.()}
          />
        )}
      </div>
    </header>
  );
}

const KOREAN_WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

function formatKoreanTodayLabel(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${
    KOREAN_WEEKDAY_LABELS[date.getDay()]
  }`;
}

function IconButton({
  ariaLabel,
  icon,
  onClick,
}: {
  ariaLabel: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-beige900/70 transition active:bg-beige900/5 disabled:opacity-40"
    >
      {icon}
    </button>
  );
}
