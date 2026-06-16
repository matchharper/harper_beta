import { HelpCircle, LogOut, Scroll } from "lucide-react";
import React, { useState } from "react";
import CareerUpdateNotesModal from "./CareerUpdateNotesModal";
import { cn } from "@/lib/utils";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

type CareerProfileMenuVariant = "desktop" | "mobile";

const CareerProfileMenu = ({
  profileImageUrl,
  profileName,
  profileEmail,
  onLogout,
  onSuggestUpdate,
  variant = "desktop",
}: {
  profileImageUrl?: string | null;
  profileName: string;
  profileEmail: string;
  onLogout: () => void | Promise<void>;
  onSuggestUpdate: () => void;
  variant?: CareerProfileMenuVariant;
}) => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateNotesOpen, setUpdateNotesOpen] = useState(false);

  const normalizedProfileName = String(profileName ?? "Candidate");
  const profileInitial =
    normalizedProfileName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";
  const hasUploadedImage = Boolean(
    profileImageUrl && !profileImageUrl.includes("media.licdn.com")
  );

  const handleOpenUpdateNotes = () => {
    logCareerEvent("click_profile_menu_update_notes");
    setUpdateNotesOpen(true);
    setMenuOpen(false);
  };

  const handleSuggestUpdate = () => {
    setUpdateNotesOpen(false);
    setMenuOpen(false);
    onSuggestUpdate();
  };

  const handleOpenSupport = () => {
    logCareerEvent("click_profile_menu_support");
    setMenuOpen(false);
    onSuggestUpdate();
  };

  const isMobile = variant === "mobile";
  const triggerClassName = isMobile
    ? cn(
        "relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-all",
        menuOpen ? "bg-bg-floating" : "active:bg-bg-weak"
      )
    : cn(
        "relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-neutral-1000-a10 bg-black text-neutral-00 transition-all",
        menuOpen
          ? "ring-4 ring-neutral-1000-a10"
          : "hover:ring-4 ring-neutral-1000-a10 hover:opacity-90"
      );

  const avatarBody = isMobile ? (
    <span
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full  border bg-black",
        menuOpen
          ? "ring-4 ring-neutral-1000-a10"
          : "hover:ring-4 ring-neutral-1000-a10 hover:opacity-90"
      )}
    >
      {hasUploadedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={String(profileImageUrl)}
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
      src={String(profileImageUrl)}
      alt={profileName}
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="text-[12px] font-normal text-neutral-00">
      {profileInitial}
    </span>
  );

  return (
    <>
      <ActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        side="bottom"
        sideOffset={isMobile ? 8 : 12}
        contentClassName="w-[236px]"
        trigger={
          <BareButton
            type="button"
            aria-label={t(
              "career.profile.career_profile_menu.0rpl24h",
              "프로필 메뉴"
            )}
            className={triggerClassName}
          >
            {avatarBody}
          </BareButton>
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
        <ActionDropdownItem
          onSelect={() => handleOpenSupport()}
          className="flex flex-row items-center gap-2.5 mt-2"
        >
          <HelpCircle className="h-4 w-4" />
          {t("career.profile.career_profile_menu.1vjbdm5", "문의하기")}
        </ActionDropdownItem>
        <ActionDropdownItem
          onSelect={() => handleOpenUpdateNotes()}
          className="flex flex-row items-center gap-2.5"
        >
          <Scroll className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            {t("career.profile.career_profile_menu.14ybad0", "업데이트 노트")}
          </span>
        </ActionDropdownItem>
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
      <CareerUpdateNotesModal
        open={updateNotesOpen}
        onClose={() => setUpdateNotesOpen(false)}
        onSuggestUpdate={handleSuggestUpdate}
      />
    </>
  );
};

export default React.memo(CareerProfileMenu);
