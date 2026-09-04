"use client";

import React from "react";
import { ChevronDown, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import CareerProfileMenu from "@/components/career/CareerProfileMenu";
import { BareButton } from "@/components/ui/button";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import CareerMobileNavigationMenu, {
  type CareerMobileNavigationOption,
  type CareerMobileNavigationOptionId,
} from "@/components/career/mobile/CareerMobileNavigationMenu";
import { useAuthStore } from "@/store/useAuthStore";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";
import { useCareerReferralAttention } from "@/hooks/career/useCareerReferralAttention";
import CareerReferralAttentionDot from "@/components/career/referral/CareerReferralAttentionDot";

export type CareerMobileTopBarOptionId = CareerMobileNavigationOptionId;
export type CareerMobileTopBarOption = CareerMobileNavigationOption;

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
  const user = useAuthStore((state) => state.user);
  const { locale } = useMessages();
  const showReferralEntryPoints = useReferralEntryPointEligibility({
    currentLocation: profileCurrentLocation,
    location: profileLocation,
    preferredLocale,
    user,
  });
  const hasUnseenReferral = useCareerReferralAttention(user?.id);
  const activeOption =
    options.find((opt) => opt.id === activeTab) ?? options[0];
  const ActiveIcon = activeOption?.icon;
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
      <CareerMobileNavigationMenu
        activeTab={activeTab}
        onChangeTab={onChangeTab}
        options={options}
      >
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
      </CareerMobileNavigationMenu>

      <div className="relative z-10 flex items-center gap-0">
        <IconButton
          ariaLabel={"설정"}
          onClick={onOpenSettings}
          icon={<Settings className="h-5 w-5" />}
          attention={showReferralEntryPoints && hasUnseenReferral}
        />
        {onLogout && (
          <CareerProfileMenu
            variant="mobile"
            profileImageUrl={profilePicture ?? null}
            profileName={userName ?? "Candidate"}
            profileEmail={userEmail ?? ""}
            showReferralEntryPoints={showReferralEntryPoints}
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
  attention = false,
  icon,
  onClick,
}: {
  ariaLabel: string;
  attention?: boolean;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <BareButton
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={!onClick}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-muted transition active:bg-bg-weak disabled:opacity-40"
    >
      {icon}
      {attention && (
        <CareerReferralAttentionDot className="absolute right-2 top-2" />
      )}
    </BareButton>
  );
}
