import { LifeBuoy, LogOut, Settings2 } from "lucide-react";
import { useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerNotificationsPopover from "./CareerNotificationsPopover";
import { careerCx } from "./ui/CareerPrimitives";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
  BeigeActionDropdownSeparator,
} from "@/components/ui/beige/action-dropdown";
import { DropdownMenuLabel } from "@/components/ui/beige/dropdown-menu";
import React from "react";

export type CareerWorkspaceTab = "home" | "profile" | "history";

export const isCareerWorkspaceTab = (
  value: string | null | undefined
): value is CareerWorkspaceTab =>
  value === "home" || value === "profile" || value === "history";

export const getCareerWorkspaceHref = (tab: CareerWorkspaceTab) =>
  tab === "home" ? "/career" : `/career/${tab}`;

const CareerWorkspaceNav = () => {
  const {
    user,
    onLogout,
    onOpenSettings,
    talentProfile,
    notifications,
    unreadNotificationCount,
    notificationsMarkingAsRead,
    notificationsError,
    onMarkNotificationsRead,
  } = useCareerSidebarContext();

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const profileName = talentProfile.talentUser?.name ?? displayName;
  const profileEmail = user?.email ?? "";
  const profileImageUrl =
    talentProfile.talentUser?.profile_picture ??
    user?.user_metadata?.avatar_url;
  const normalizedProfileName = String(profileName ?? "Candidate");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const profileInitial =
    normalizedProfileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";

  const handleOpenSupport = () => {
    if (typeof window === "undefined") return;
    const crispWebsiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID;
    if (!crispWebsiteId) return;

    const crispWindow = window as Window & {
      $crisp?: Array<unknown[]>;
      CRISP_WEBSITE_ID?: string;
    };

    crispWindow.$crisp = crispWindow.$crisp || [];
    crispWindow.CRISP_WEBSITE_ID = crispWebsiteId;

    if (!document.getElementById("crisp-loader")) {
      const script = document.createElement("script");
      script.id = "crisp-loader";
      script.src = "https://client.crisp.chat/l.js";
      script.async = true;
      document.head.appendChild(script);
    }

    const openChat = () => {
      crispWindow.$crisp?.push(["do", "chat:show"]);
      crispWindow.$crisp?.push(["do", "chat:open"]);
    };

    openChat();
    window.setTimeout(openChat, 240);
    setProfileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-20 bg-beige50 text-beige900 backdrop-blur-xl">
      <div className="flex flex-row items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <div className="font-halant text-[1.1rem] text-beige900">Harper</div>
        <div className="flex items-center gap-2">
          <CareerNotificationsPopover
            notifications={notifications}
            unreadNotificationCount={unreadNotificationCount}
            notificationsMarkingAsRead={notificationsMarkingAsRead}
            notificationsError={notificationsError}
            onMarkNotificationsRead={onMarkNotificationsRead}
            showLabel={false}
            align="end"
            side="bottom"
            sideOffset={12}
            buttonClassName="h-8 w-8 rounded-xl border border-beige900/10 bg-white/75 px-0 text-beige900 shadow-[0_8px_24px_rgba(37,20,6,0.05)] hover:border-beige900/20 hover:bg-white"
          />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="설정"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-beige900/10 bg-white/75 text-beige900 shadow-[0_8px_24px_rgba(37,20,6,0.05)] transition-colors hover:border-beige900/20 hover:bg-white"
          >
            <Settings2 className="h-4 w-4" />
          </button>
          <BeigeActionDropdown
            open={profileMenuOpen}
            onOpenChange={setProfileMenuOpen}
            align="end"
            side="bottom"
            sideOffset={12}
            contentClassName="w-[236px]"
            trigger={
              <button
                type="button"
                aria-label="프로필 메뉴"
                className={careerCx(
                  "flex h-8 w-8 items-center justify-center overflow-hidden rounded-[12px] border bg-white/80 shadow-[0_8px_24px_rgba(37,20,6,0.05)] transition-all",
                  profileMenuOpen
                    ? "border-beige900/20 ring-4 ring-white/70"
                    : "border-beige900/10 hover:border-beige900/20 hover:bg-white"
                )}
              >
                {profileImageUrl &&
                !profileImageUrl.includes("media.licdn.com") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImageUrl}
                    alt={profileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-medium text-beige900">
                    {profileInitial}
                  </span>
                )}
              </button>
            }
          >
            <DropdownMenuLabel className="px-3 pb-2 pt-2.5">
              <div className="truncate text-sm font-medium text-beige900">
                {profileName}
              </div>
              <div className="mt-1 truncate text-[12px] font-normal text-beige900/50">
                {profileEmail || "Career profile"}
              </div>
            </DropdownMenuLabel>
            <BeigeActionDropdownSeparator />
            <BeigeActionDropdownItem
              onSelect={handleOpenSupport}
              className="flex flex-row items-center gap-2.5"
            >
              <LifeBuoy className="h-4 w-4" />
              문의하기
            </BeigeActionDropdownItem>
            <BeigeActionDropdownItem
              onSelect={() => void onLogout()}
              tone="danger"
              className="flex flex-row items-center gap-2.5"
            >
              <LogOut className="h-4 w-4" />
              로그아웃
            </BeigeActionDropdownItem>
          </BeigeActionDropdown>
        </div>
      </div>
    </header>
  );
};

export default React.memo(CareerWorkspaceNav);
