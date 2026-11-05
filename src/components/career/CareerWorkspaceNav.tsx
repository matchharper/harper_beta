import { Home, Settings } from "lucide-react";
import React, { useState } from "react";
import Image from "next/image";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import CareerProfileMenu from "./CareerProfileMenu";
import CareerSupportInquiryModal from "./CareerSupportInquiryModal";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getAuthenticatedUserProfileImageUrl,
  getCareerMenuProfileImageUrl,
} from "./profileAvatar";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";
import { useCareerReferralAttention } from "@/hooks/career/useCareerReferralAttention";
import CareerReferralAttentionDot from "./referral/CareerReferralAttentionDot";

export type CareerWorkspaceTab =
  | "chat"
  | "home"
  | "tasks"
  | "profile"
  | "documents"
  | "brief"
  | "history"
  | "watchlist";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "chat" ||
  value === "home" ||
  value === "tasks" ||
  value === "profile" ||
  value === "documents" ||
  value === "brief" ||
  value === "history" ||
  value === "watchlist";

export const getCareerWorkspaceHref = (tab: CareerWorkspaceTab) =>
  tab === "home" ? "/career" : `/career/${tab}`;

export const getCareerWorkspaceTabFromPath = (path: string) => {
  const pathname = path.split(/[?#]/)[0]?.replace(/\/+$/, "") || "/career";
  const queryString = path.split("?")[1]?.split("#")[0] ?? "";
  const searchParams = new URLSearchParams(queryString);

  if (
    pathname === "/career/profile" &&
    searchParams.get("profileSection") === "brief"
  ) {
    return "brief";
  }

  if (
    pathname === "/career/profile" &&
    (["links", "connections"].includes(
      searchParams.get("profileSection") ?? ""
    ) ||
      searchParams.has("documentId") ||
      searchParams.has("callNoteId"))
  ) {
    return "documents";
  }

  if (pathname === "/career") {
    return searchParams.has("historyTab") ||
      searchParams.has("savedStage") ||
      searchParams.has("id")
      ? "history"
      : "home";
  }

  const [, root, tab] = pathname.split("/");
  if (root !== "career") return "home";
  return isCareerWorkspaceTab(tab) ? tab : "home";
};

export type CareerDesktopNavTab = "tasks" | "history" | "profile" | "brief";

export function CareerNewOpportunityIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <Image
      alt=""
      className={cn("size-5", className)}
      height={20}
      src="/svgs/loader.svg"
      width={20}
    />
  );
}

export const getCareerDesktopNavLabels = (
  t: ReturnType<typeof useCareerT>
): Record<CareerDesktopNavTab, string> => ({
  tasks: t("career.tasks.title", "할 일"),
  history: t("career.workspace.opportunities", "기회"),
  profile: t("career.workspace.my_information", "내 정보"),
  brief: t(
    "career.profile.career_profile_workspace.search_brief_tab",
    "원하는 조건"
  ),
});

type TopTab = "home" | "chat" | "history";

const CareerWorkspaceNav = ({
  activeTab,
  isMobile = false,
  opportunityCount,
  onChangeTab,
}: {
  activeTab: CareerWorkspaceTab;
  isMobile?: boolean;
  opportunityCount: number;
  onChangeTab: (tab: CareerWorkspaceTab) => void;
}) => {
  const t = useCareerT();
  const { onLogout, onOpenSettings } = useCareerSidebarContext();
  const { preferredLocale, talentProfile, user } = useCareerProfileContext();
  const showReferral = useReferralEntryPointEligibility({
    location: talentProfile.talentUser?.location,
    currentLocation: talentProfile.talentUser?.current_location,
    preferredLocale,
    user,
  });
  const hasUnseenReferral = useCareerReferralAttention(user?.id);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const profileName = String(
    talentProfile.talentUser?.name ??
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      user?.email?.split("@")[0] ??
      "Harper"
  );
  const profileEmail = talentProfile.talentUser?.email ?? user?.email ?? "";
  const profileImageUrl = getCareerMenuProfileImageUrl({
    authenticatedUserImageUrl: getAuthenticatedUserProfileImageUrl(user),
    talentProfileImageUrl: talentProfile.talentUser?.profile_picture,
  });
  const selected: TopTab =
    activeTab === "history"
      ? "history"
      : isMobile && (activeTab === "home" || activeTab === "tasks")
        ? "home"
        : "chat";
  const items: TabBoxItem<TopTab>[] = [
    ...(isMobile
      ? [{ value: "home" as const, label: t("career.sky.home", "홈") }]
      : []),
    { value: "chat", label: t("career.sky.chat", "채팅") },
    {
      value: "history",
      label: t("career.workspace.opportunities", "기회"),
      countLabel:
        opportunityCount > 0 ? (
          <span className="career-nav-count">{opportunityCount}</span>
        ) : undefined,
    },
  ];
  return (
    <>
      <header className="career-topbar">
        <div className="career-topbar-home">
          <Tooltips text={t("career.sky.home", "홈")}>
            <MuteButton
              aria-label={t("career.sky.home", "홈")}
              onClick={() => onChangeTab("home")}
            >
              <Home className="size-[18px]" strokeWidth={1.6} />
            </MuteButton>
          </Tooltips>
        </div>
        <TabBoxes<TopTab>
          aria-label="Career"
          className="career-top-tabs career-glass"
          variant="neutral"
          size="lg"
          activeValue={selected}
          items={items}
          onValueChange={onChangeTab}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
              return;
            const index = items.findIndex((item) => item.value === selected);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowRight" ? 1 : -1) +
                      items.length) %
                    items.length;
            event.preventDefault();
            onChangeTab(items[next].value);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [next]?.focus();
          }}
        />
        <div className="career-topbar-actions">
          <MuteButton
            className="relative"
            aria-label={t("career.common.career.1338q8i", "설정")}
            onClick={onOpenSettings}
          >
            <Settings aria-hidden className="size-4" strokeWidth={1.6} />
            <span className="career-settings-label">
              {t("career.common.career.1338q8i", "설정")}
            </span>
            {showReferral && hasUnseenReferral ? (
              <CareerReferralAttentionDot className="absolute right-1 top-1" />
            ) : null}
          </MuteButton>
          <CareerProfileMenu
            profileImageUrl={profileImageUrl}
            profileName={profileName}
            profileEmail={profileEmail}
            onLogout={onLogout}
            onSuggestUpdate={() => setInquiryOpen(true)}
            onNavigate={onChangeTab}
          />
        </div>
      </header>
      {inquiryOpen && (
        <CareerSupportInquiryModal
          onClose={() => setInquiryOpen(false)}
          defaultEmail={profileEmail}
        />
      )}
    </>
  );
};
export default React.memo(CareerWorkspaceNav);
