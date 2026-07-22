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
import { BareButton } from "@/components/ui/button";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

export type CareerMobileTopBarOptionId = CareerWorkspaceTab | "inbox" | "jobs";

export type CareerMobileTopBarOption = {
  badgeCount?: number;
  id: CareerMobileTopBarOptionId;
  label: string;
  icon?: LucideIcon;
};

type CareerMobileTopBarProps = {
  activeTab: CareerMobileTopBarOptionId;
  options: CareerMobileTopBarOption[];
  onChangeTab: (tab: CareerMobileTopBarOptionId) => void;
  profilePicture?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  profileLocation?: string | null;
  profileCurrentLocation?: string | null;
  preferredLocale?: string | null;
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
  profileLocation,
  profileCurrentLocation,
  preferredLocale,
  onOpenSettings,
  onOpenSupport,
  onLogout,
  className,
}: CareerMobileTopBarProps) {
  const t = useCareerT();

  const { locale } = useMessages();
  const activeOption =
    options.find((opt) => opt.id === activeTab) ?? options[0];
  const ActiveIcon = activeOption?.icon;
  const activeBadgeCount = activeOption?.badgeCount ?? 0;
  const todayLabel = React.useMemo(
    () => formatTodayLabel(new Date(), locale, t),
    [locale, t]
  );
  const showHomeDate = activeTab === "home";

  return (
    <header
      className={cn(
        "relative flex h-12 items-center justify-between px-2 text-neutral-primary backdrop-blur-xl",
        className
      )}
    >
      {showHomeDate ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[14px] font-normal text-neutral-soft">
          {todayLabel}
        </div>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <BareButton
            type="button"
            className="relative z-10 inline-flex h-11 max-w-[180px] items-center gap-1 rounded-md px-2.5 text-base font-medium text-neutral-primary transition active:bg-bg-weak"
          >
            {ActiveIcon && (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-neutral-primary">
                <ActiveIcon className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 truncate">{activeOption?.label}</span>
            <ChevronDown className="h-5 w-5 shrink-0 text-neutral-muted" />
          </BareButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={4}
          className="min-w-[196px] rounded-xl p-1 text-neutral-primary"
        >
          {options.map((opt) => {
            const Icon = opt.icon;
            const active = opt.id === activeTab;
            const badgeCount = opt.badgeCount ?? 0;

            return (
              <DropdownMenuItem
                key={opt.id}
                data-career-topbar-option-id={opt.id}
                onSelect={() => onChangeTab(opt.id)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2.5 text-sm text-neutral-primary focus:bg-bg-weak/70 focus:text-neutral-primary",
                  active && "bg-bg-weak/70 font-medium"
                )}
              >
                {Icon && (
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-neutral-muted">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {badgeCount > 0 ? (
                  <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 px-2.5 text-[11px] leading-none text-neutral-00">
                    {badgeCount}
                  </span>
                ) : null}
                {active && (
                  <Check className="h-4 w-4 shrink-0 text-neutral-muted" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="relative z-10 flex items-center gap-0">
        <IconButton
          ariaLabel={"설정"}
          onClick={onOpenSettings}
          icon={<Settings className="h-5 w-5" />}
        />
        {onLogout && (
          <CareerProfileMenu
            variant="mobile"
            profileImageUrl={profilePicture ?? null}
            profileName={userName ?? "Candidate"}
            profileEmail={userEmail ?? ""}
            profileLocation={profileLocation}
            profileCurrentLocation={profileCurrentLocation}
            preferredLocale={preferredLocale}
            onLogout={onLogout}
            onSuggestUpdate={() => onOpenSupport?.()}
          />
        )}
      </div>
    </header>
  );
}

const getKoreanWeekdayLabels = (t: ReturnType<typeof useCareerT>) =>
  [
    t("career.common.career_mobile_top_bar.1s93gcz", "일요일"),
    t("career.common.career_mobile_top_bar.1ih373f", "월요일"),
    t("career.common.career_mobile_top_bar.0kpy78r", "화요일"),
    t("career.common.career_mobile_top_bar.1f1oien", "수요일"),
    t("career.common.career_mobile_top_bar.1jmvi1w", "목요일"),
    t("career.common.career_mobile_top_bar.0wg5ren", "금요일"),
    t("career.common.career_mobile_top_bar.1xwrfxz", "토요일"),
  ] as const;

const ENGLISH_TODAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function formatTodayLabel(
  date: Date,
  locale: Locale,
  t: ReturnType<typeof useCareerT>
) {
  if (locale === "en") return ENGLISH_TODAY_FORMATTER.format(date);
  const weekdayLabels = getKoreanWeekdayLabels(t);
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${
    weekdayLabels[date.getDay()]
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
    <BareButton
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-muted transition active:bg-bg-weak disabled:opacity-40"
    >
      {icon}
    </BareButton>
  );
}
