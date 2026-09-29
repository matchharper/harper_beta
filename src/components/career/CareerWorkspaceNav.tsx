import {
  BriefcaseBusiness,
  Inbox,
  PanelLeft,
  Settings,
  SlidersHorizontal,
  TextSelect,
  User,
} from "lucide-react";
import { useState } from "react";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import CareerProfileMenu from "./CareerProfileMenu";
import CareerSupportInquiryModal from "./CareerSupportInquiryModal";
import React from "react";
import { MuteButton } from "@/components/ui/button";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import { useCareerT } from "@/i18n/useCareerT";
import {
  getAuthenticatedUserProfileImageUrl,
  getCareerMenuProfileImageUrl,
} from "@/components/career/profileAvatar";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";
import { useCareerReferralAttention } from "@/hooks/career/useCareerReferralAttention";
import CareerReferralAttentionDot from "./referral/CareerReferralAttentionDot";
import Image from "next/image";

export type CareerWorkspaceTab =
  | "home"
  | "tasks"
  | "profile"
  | "brief"
  | "history"
  | "watchlist";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "home" ||
  value === "tasks" ||
  value === "profile" ||
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

export type CareerDesktopNavTab =
  | "tasks"
  | "new"
  | "saved"
  | "profile"
  | "brief";

export function CareerNewOpportunityIcon({ className }: { className?: string }) {
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
  new: t("career.workspace.new_opportunities", "새 기회"),
  saved: t("career.workspace.my_opportunities", "내 기회"),
  profile: t("career.common.career_workspace_screen.0b0v9cr", "프로필"),
  brief: t(
    "career.profile.career_profile_workspace.search_brief_tab",
    "선호 기준"
  ),
});

// Match the /org sidebar's row geometry and selection treatment.
const NAV_ITEM_CLASS_NAME =
  "relative flex h-9 w-full items-center justify-start gap-2.5 overflow-hidden rounded-md px-2.5 text-[14.5px] font-normal text-neutral-primary";

const CareerWorkspaceNav = ({
  activeTab,
  decisionCount,
  pendingInternalRoleFeedbackCount,
  pendingExternalRoleFeedbackCount,
  onChangeTab,
}: {
  activeTab: CareerDesktopNavTab | null;
  decisionCount: number;
  pendingInternalRoleFeedbackCount: number;
  pendingExternalRoleFeedbackCount: number;
  onChangeTab: (tab: CareerDesktopNavTab) => void;
}) => {
  const t = useCareerT();
  const sidebarCollapsed = useCareerWorkspaceUiStore(
    (state) => state.desktopSidebarCollapsed
  );
  const setSidebarCollapsed = useCareerWorkspaceUiStore(
    (state) => state.setDesktopSidebarCollapsed
  );
  const sidebarToggleLabel = sidebarCollapsed
    ? t("career.workspace.expand_sidebar", "메뉴 펼치기")
    : t("career.workspace.collapse_sidebar", "메뉴 접기");
  const settingsLabel = t("career.common.career.1338q8i", "설정");

  const { onLogout, onOpenSettings } = useCareerSidebarContext();
  const { preferredLocale, talentProfile, user } = useCareerProfileContext();
  const showReferralEntryPoints = useReferralEntryPointEligibility({
    location: talentProfile.talentUser?.location,
    currentLocation: talentProfile.talentUser?.current_location,
    preferredLocale,
    user,
  });
  const hasUnseenReferral = useCareerReferralAttention(user?.id);

  const authDisplayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const profileName = talentProfile.talentUser?.name ?? authDisplayName;
  const profileEmail = talentProfile.talentUser?.email ?? user?.email ?? "";
  const profileImageUrl = getCareerMenuProfileImageUrl({
    authenticatedUserImageUrl: getAuthenticatedUserProfileImageUrl(user),
    talentProfileImageUrl: talentProfile.talentUser?.profile_picture,
  });

  const [inquiryOpen, setInquiryOpen] = useState(false);
  const navLabels = getCareerDesktopNavLabels(t);
  const navItems: {
    id: CareerDesktopNavTab;
    icon: React.ReactNode;
    label: string;
    count?: number;
    countClassName?: string;
  }[] = [
    {
      id: "tasks",
      icon: <Inbox className="size-4.5" strokeWidth={1.5} />,
      label: navLabels.tasks,
      count: decisionCount,
    },
    {
      id: "new",
      icon: <CareerNewOpportunityIcon />,
      label: navLabels.new,
      count:
        pendingInternalRoleFeedbackCount > 0
          ? pendingInternalRoleFeedbackCount
          : pendingExternalRoleFeedbackCount,
      countClassName:
        pendingInternalRoleFeedbackCount > 0 ? undefined : "bg-action text-white",
    },
    {
      id: "saved",
      icon: <BriefcaseBusiness className="size-4.5" strokeWidth={1.5} />,
      label: navLabels.saved,
    },
    {
      id: "profile",
      icon: <User className="size-4.5" strokeWidth={1.5} />,
      label: navLabels.profile,
    },
    {
      id: "brief",
      icon: <TextSelect className="size-4.5" strokeWidth={1.5} />,
      label: navLabels.brief,
    },
  ];

  return (
    <>
      <aside
        className={cn(
          "flex h-full shrink-0 flex-col border-r border-neutral-1000-a05 bg-bg-basement py-3 text-neutral-primary transition-[width,padding] duration-200 motion-reduce:transition-none",
          sidebarCollapsed ? "w-16 px-2" : "w-[244px] px-3"
        )}
      >
        <div
          className={cn(
            "mb-4 flex h-9 items-center",
            sidebarCollapsed ? "justify-center" : "justify-between pl-2.5"
          )}
        >
          {!sidebarCollapsed && (
            <span className="font-hedvig text-[1.1rem]">Harper</span>
          )}
          <Tooltips text={sidebarToggleLabel} side="right">
            <MuteButton
              type="button"
              variant="transparent"
              aria-label={sidebarToggleLabel}
              aria-expanded={!sidebarCollapsed}
              aria-controls="career-desktop-navigation"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {/* {sidebarCollapsed ? ( */}
              <PanelLeft aria-hidden className="size-4.5" strokeWidth={1.5} />
              {/* ) : (
                <PanelLeft aria-hidden className="size-4.5" strokeWidth={1.5} />
              )} */}
            </MuteButton>
          </Tooltips>
        </div>
        <nav
          id="career-desktop-navigation"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto"
          aria-label="Career"
        >
          {navItems.map(({ id, icon, label, count, countClassName }) => (
            <Tooltips
              key={id}
              text={sidebarCollapsed ? label : ""}
              side="right"
            >
              <MuteButton
                variant="transparent"
                aria-label={sidebarCollapsed ? label : undefined}
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => onChangeTab(id)}
                className={cn(
                  NAV_ITEM_CLASS_NAME,
                  sidebarCollapsed && "justify-center",
                  activeTab === id &&
                    "bg-neutral-300/70 text-black hover:bg-neutral-200"
                )}
              >
                <span aria-hidden className="inline-flex shrink-0">
                  {icon}
                </span>
                {!sidebarCollapsed && (
                  <>
                    <span className="truncate">{label}</span>
                    {typeof count === "number" && count > 0 ? (
                      <NavCount count={count} className={countClassName} />
                    ) : null}
                  </>
                )}
              </MuteButton>
            </Tooltips>
          ))}
        </nav>
        <div className="shrink-0 space-y-2 pt-4">
          <Tooltips text={sidebarCollapsed ? settingsLabel : ""} side="right">
            <MuteButton
              type="button"
              variant="transparent"
              aria-label={sidebarCollapsed ? settingsLabel : undefined}
              onClick={onOpenSettings}
              className={cn(
                NAV_ITEM_CLASS_NAME,
                sidebarCollapsed && "justify-center"
              )}
            >
              <Settings
                aria-hidden
                className="size-4.5 shrink-0"
                strokeWidth={1.5}
              />
              {!sidebarCollapsed && settingsLabel}
              {showReferralEntryPoints && hasUnseenReferral ? (
                <CareerReferralAttentionDot className="absolute right-2 top-2" />
              ) : null}
            </MuteButton>
          </Tooltips>
          <CareerProfileMenu
            variant="sidebar"
            sidebarCollapsed={sidebarCollapsed}
            profileImageUrl={profileImageUrl}
            profileName={String(profileName ?? "Candidate")}
            profileEmail={profileEmail}
            showReferralEntryPoints={showReferralEntryPoints}
            onLogout={onLogout}
            onSuggestUpdate={() => setInquiryOpen(true)}
          />
        </div>
      </aside>
      {inquiryOpen && (
        <CareerSupportInquiryModal
          onClose={() => setInquiryOpen(false)}
          defaultEmail={profileEmail}
        />
      )}
    </>
  );
};

const NavCount = ({
  count,
  className,
}: {
  count: number;
  className?: string;
}) => (
  <span
    className={cn(
      "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-faded px-1.5 text-[11px] leading-none text-primary",
      className
    )}
  >
    {count}
  </span>
);

export default React.memo(CareerWorkspaceNav);
