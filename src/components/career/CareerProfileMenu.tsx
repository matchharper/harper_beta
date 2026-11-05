import {
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
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
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
}: {
  profileImageUrl?: string | null;
  profileName: string;
  profileEmail: string;
  onLogout: () => void | Promise<void>;
  onSuggestUpdate: () => void;
  variant?: CareerProfileMenuVariant;
  sidebarCollapsed?: boolean;
  onNavigate?: (tab: CareerWorkspaceTab) => void;
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

  return (
    <>
      <ActionDropdown
        open={menuOpen}
        onOpenChange={handleMenuOpenChange}
        align={isSidebar ? "start" : "end"}
        side={isSidebar ? "top" : "bottom"}
        sideOffset={isMobile ? 8 : 12}
        contentClassName="w-[236px]"
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
        <DropdownMenuLabel className="px-3 pb-2 pt-2.5">
          <div className="truncate text-sm font-medium text-neutral-primary">
            {profileName}
          </div>
          <div className="mt-1 truncate text-[12px] font-normal text-neutral-soft">
            {profileEmail || "Career profile"}
          </div>
        </DropdownMenuLabel>
        {onNavigate && <>
          {([
            { tab: "profile", icon: User, label: t("career.workspace.my_information", "내 정보") },
            { tab: "documents", icon: FileText, label: t("career.sky.documents", "자료") },
            { tab: "brief", icon: TextSelect, label: t("career.profile.career_profile_workspace.search_brief_tab", "원하는 조건") },
            { tab: "watchlist", icon: Building2, label: t("career.sky.companies", "관심 회사") },
          ] as const).map(({ tab, icon: Icon, label }) => <ActionDropdownItem key={tab} onSelect={() => { closeMenu(); onNavigate(tab); }}><Icon className="size-4" />{label}</ActionDropdownItem>)}
          <ActionDropdownSeparator />
        </>}
        <ActionDropdownItem
          onSelect={() => handleOpenSupport()}
          className="flex flex-row items-center gap-2.5 mt-2 font-normal"
        >
          <HelpCircle className="h-4 w-4" />
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
              className={cn(aboutMenuItemClassName, "mt-0")}
            >
              <Info className="h-4 w-4" />
              <span className="min-w-0 flex-1">About</span>
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 text-neutral-soft transition-transform",
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
            <DropdownMenuSubTrigger
              className={cn(aboutMenuItemClassName, "mt-0")}
            >
              <Info className="h-4 w-4" />
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
        <ActionDropdownSeparator />
        <ActionDropdownItem
          onSelect={() => {
            logCareerEvent("click_profile_menu_logout");
            void onLogout();
          }}
          tone="danger"
          className="flex flex-row items-center gap-2.5"
        >
          <LogOut className="h-4 w-4" />
          {t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
        </ActionDropdownItem>
      </ActionDropdown>
    </>
  );
};

export default React.memo(CareerProfileMenu);
