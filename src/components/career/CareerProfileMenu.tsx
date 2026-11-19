import {
  CalendarClock,
  User,
  FileText,
  TextSelect,
  Building2,
  ChevronDown,
  Compass,
  ExternalLink,
  Gift,
  HelpCircle,
  Info,
  Landmark,
  LogOut,
  MessageCircle,
  Rotate3D,
  ScrollText,
} from "lucide-react";
import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { GroupedList } from "@/components/ui/grouped-list";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import Image from "next/image";

import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";

type CareerProfileMenuVariant = "desktop" | "mobile" | "sidebar";

const aboutMenuItemClassName =
  "flex py-2 cursor-pointer font-normal items-center gap-2.5 rounded-md px-3 text-sm text-neutral-primary outline-none transition-colors focus:bg-bg-basement focus:text-neutral-primary";

const aboutSubmenuClassName =
  "w-[248px] rounded-menu border-(length:--menu-border-width) border-menu-border bg-menu bg-menu-image text-menu-foreground shadow-(--shadow-menu) backdrop-blur-menu p-1";

const CareerProfileMenu = ({
  profileImageUrl,
  profileName,
  profileEmail,
  onLogout,
  onSuggestUpdate,
  variant = "desktop",
  sidebarCollapsed = false,
  onNavigate,
  onOpenProfile,
  onOpenSchedules,
}: {
  profileImageUrl?: string | null;
  profileName: string;
  profileEmail: string;
  onLogout: () => void | Promise<void>;
  onSuggestUpdate: () => void;
  variant?: CareerProfileMenuVariant;
  sidebarCollapsed?: boolean;
  onNavigate?: (tab: CareerWorkspaceTab) => void;
  /** Opens a full profile screen from the avatar instead of the dropdown. */
  onOpenProfile?: () => void;
  onOpenSchedules?: () => void;
}) => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const normalizedProfileName = String(profileName ?? "Candidate");
  const profileInitial =
    normalizedProfileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";
  const normalizedProfileImageUrl =
    typeof profileImageUrl === "string" ? profileImageUrl.trim() : "";
  const hasUploadedImage = Boolean(
    normalizedProfileImageUrl &&
    !normalizedProfileImageUrl.includes("media.licdn.com")
  );

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) {
      setAboutMenuOpen(false);
    }
  };

  const closeMenu = () => {
    setAboutMenuOpen(false);
    setMenuOpen(false);
  };

  const handleOpenSupport = () => {
    logCareerEvent("click_profile_menu_support");
    closeMenu();
    onSuggestUpdate();
  };

  const handleTalkToFounder = () => {
    logCareerEvent("click_profile_menu_about_talk_to_founder");
    closeMenu();
    window.setTimeout(openCustomCrispWidget, 0);
  };

  const handleExternalAboutLinkClick = (eventName: string) => {
    logCareerEvent(eventName);
    closeMenu();
  };

  const isMobile = variant === "mobile";
  const isSidebar = variant === "sidebar";
  const triggerClassName = isSidebar
    ? sidebarCollapsed
      ? "w-full justify-center"
      : "w-full justify-start gap-2.5 text-left"
    : isMobile
      ? cn(
          "relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-all",
          menuOpen ? "bg-bg-floating" : "active:bg-bg-weak"
        )
      : cn(
          "relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a10 bg-surface-inverse text-neutral-00 transition-all",
          menuOpen
            ? "ring-4 ring-neutral-1000-a10"
            : "hover:ring-4 ring-neutral-1000-a10 hover:opacity-90"
        );

  const avatarBody = isMobile ? (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full  border bg-surface-inverse",
        menuOpen
          ? "ring-4 ring-neutral-1000-a10"
          : "hover:ring-4 ring-neutral-1000-a10 hover:opacity-90"
      )}
    >
      {hasUploadedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={normalizedProfileImageUrl}
          alt={profileName}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-[12px] font-normal text-neutral-00">
          {profileInitial}
        </span>
      )}
    </span>
  ) : hasUploadedImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={normalizedProfileImageUrl}
      alt={profileName}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="text-[12px] font-normal text-neutral-00">
      {profileInitial}
    </span>
  );

  const aboutMenuItems = (
    <>
      <DropdownMenuItem
        onSelect={handleTalkToFounder}
        className={aboutMenuItemClassName}
      >
        <MessageCircle className="h-4 w-4" />
        <span className="min-w-0 flex-1">Chat with us</span>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={aboutMenuItemClassName}>
        <a
          href="/update-notes"
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            handleExternalAboutLinkClick("click_profile_menu_update_notes")
          }
        >
          <ScrollText className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            {t("career.common.career.14ybad0", "업데이트 노트")}
          </span>
          <ExternalLink
            className="ml-auto text-neutral-soft"
            size={12}
            strokeWidth={1.8}
          />
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={aboutMenuItemClassName}>
        <a
          href="https://www.linkedin.com/company/matchharper/"
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            handleExternalAboutLinkClick("click_profile_menu_about_linkedin")
          }
        >
          <Image
            src="/images/logos/linkedin.svg"
            alt="Linkedin"
            width={20}
            height={20}
            className="-ml-0.5"
          />
          <span className="min-w-0 flex-1">Linkedin</span>
          <ExternalLink
            className="ml-auto text-neutral-soft"
            size={12}
            strokeWidth={1.8}
          />
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={aboutMenuItemClassName}>
        <a
          href="https://matchharper.com/about"
          target="_blank"
          rel="noreferrer"
          onClick={() =>
            handleExternalAboutLinkClick("click_profile_menu_about_about_us")
          }
        >
          <Landmark />
          <span className="min-w-0 flex-1">About us</span>
          <ExternalLink
            className="ml-auto text-neutral-soft"
            size={12}
            strokeWidth={1.8}
          />
        </a>
      </DropdownMenuItem>
    </>
  );

  if (onOpenProfile) {
    return (
      <BareButton
        type="button"
        aria-label={"프로필 메뉴"}
        aria-haspopup="dialog"
        onClick={onOpenProfile}
        className={cn(triggerClassName, "career-avatar")}
      >
        {avatarBody}
      </BareButton>
    );
  }

  const menuRowClassName =
    "min-h-9 gap-2.5 rounded-lg px-2.5 py-0 text-sm font-normal [&>svg]:size-4 [&>svg]:stroke-[1.75]";

  return (
    <>
      <ActionDropdown
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        align={isSidebar ? "start" : "end"}
        side={isSidebar ? "top" : "bottom"}
        sideOffset={isMobile ? 8 : 12}
        contentClassName="w-[354px] space-y-1.5 bg-bg-basement bg-none p-1.5"
        trigger={
          isSidebar ? (
            <MuteButton
              variant="transparent"
              aria-label={"프로필 메뉴"}
              title={sidebarCollapsed ? profileName : undefined}
              className={cn(triggerClassName, !isSidebar && "career-avatar")}
            >
              <>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a10 bg-surface-inverse text-neutral-00",
                    sidebarCollapsed ? "size-7" : "size-8"
                  )}
                >
                  {avatarBody}
                </span>
                {!sidebarCollapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {profileName}
                    </span>
                    <span className="block truncate text-[12px] font-light text-neutral-soft">
                      {profileEmail}
                    </span>
                  </span>
                )}
              </>
            </MuteButton>
          ) : (
            <BareButton
              type="button"
              aria-label={"프로필 메뉴"}
              className={cn(triggerClassName, !isSidebar && "career-avatar")}
            >
              {avatarBody}
            </BareButton>
          )
        }
      >
        <DropdownMenuLabel className="flex items-center gap-2.5 px-2.5 pb-1 pt-1.5 font-normal">
            <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-inverse text-sm text-neutral-00">
              {hasUploadedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={normalizedProfileImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                profileInitial
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-neutral-primary">
                {profileName}
              </span>
              <span className="block truncate text-[12px] text-neutral-600">
                {profileEmail || "Career profile"}
              </span>
            </span>
          </DropdownMenuLabel>
        {onNavigate && (
          <GroupedList className="px-1 py-0.5">
            {(
              [
                { tab: "profile", icon: User, label: t("career.workspace.my_information", "내 정보") },
                { tab: "documents", icon: FileText, label: t("career.sky.documents", "자료") },
                { tab: "brief", icon: TextSelect, label: t("career.profile.career_profile_workspace.search_brief_tab", "원하는 조건") },
              ] as const
            ).map(({ tab, icon: Icon, label }) => (
              <ActionDropdownItem
                key={tab}
                className={menuRowClassName}
                onSelect={() => {
                  closeMenu();
                  onNavigate(tab);
                }}
              >
                <Icon />
                {label}
              </ActionDropdownItem>
            ))}
            {onOpenSchedules && (
              <ActionDropdownItem
                className={menuRowClassName}
                onSelect={() => {
                  logCareerEvent("click_profile_menu_schedules");
                  closeMenu();
                  onOpenSchedules();
                }}
              >
                <CalendarClock />
                {t("career.automation.schedules", "예약된 작업")}
              </ActionDropdownItem>
            )}
            <ActionDropdownItem
              className={menuRowClassName}
              onSelect={() => {
                closeMenu();
                onNavigate("watchlist");
              }}
            >
              <Building2 />
              {t("career.sky.companies", "관심 회사")}
            </ActionDropdownItem>
          </GroupedList>
        )}
        <GroupedList className="px-1 py-0.5">
          <ActionDropdownItem
            onSelect={() => handleOpenSupport()}
            className={menuRowClassName}
          >
            <HelpCircle />
            {t("career.profile.career_profile_menu.1vjbdm5", "문의하기")}
          </ActionDropdownItem>
          {isMobile ? (
            <div>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setAboutMenuOpen((open) => !open);
                }}
                aria-expanded={aboutMenuOpen}
                className={menuRowClassName}
              >
                <Info />
                <span className="min-w-0 flex-1">About</span>
                <ChevronDown
                  className={cn(
                    "ml-auto text-neutral-soft transition-transform",
                    aboutMenuOpen && "rotate-180"
                  )}
                />
              </DropdownMenuItem>
              {aboutMenuOpen ? (
                <div
                  role="group"
                  aria-label="About"
                  className="mt-1 rounded-md bg-bg-basement/70 p-1"
                >
                  {aboutMenuItems}
                </div>
              ) : null}
            </div>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={menuRowClassName}>
                <Info />
                <span className="min-w-0 flex-1">About</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                sideOffset={8}
                alignOffset={-4}
                collisionPadding={8}
                className={aboutSubmenuClassName}
              >
                {aboutMenuItems}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <ActionDropdownItem
            onSelect={() => {
              logCareerEvent("click_profile_menu_logout");
              void onLogout();
            }}
            tone="danger"
            className={menuRowClassName}
          >
            <LogOut />
            {t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
          </ActionDropdownItem>
        </GroupedList>
      </ActionDropdown>
    </>
  );
};

export default React.memo(CareerProfileMenu);
