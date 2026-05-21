import { HelpCircle, LogOut, Scroll } from "lucide-react";
import React, { useState } from "react";
import CareerUpdateNotesModal from "./CareerUpdateNotesModal";
import { careerCx } from "./ui/CareerPrimitives";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
  BeigeActionDropdownSeparator,
} from "@/components/ui/beige/action-dropdown";
import { DropdownMenuLabel } from "@/components/ui/beige/dropdown-menu";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

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
    ? careerCx(
        "relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-all",
        menuOpen ? "bg-beige100" : "active:bg-beige900/5"
      )
    : careerCx(
        "relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[12px] border bg-beige100 transition-all",
        menuOpen
          ? "border-beige900/20 ring-4 ring-beige200"
          : "border-beige900/10 hover:border-beige900/20 hover:bg-white"
      );

  const avatarBody = isMobile ? (
    <span
      className={careerCx(
        "inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border bg-beige100",
        menuOpen ? "border-beige900/20" : "border-beige900/10"
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
        <span className="text-xs font-medium text-beige900">
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
    <span className="text-xs font-medium text-beige900">{profileInitial}</span>
  );

  return (
    <>
      <BeigeActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="end"
        side="bottom"
        sideOffset={isMobile ? 8 : 12}
        contentClassName="w-[236px]"
        trigger={
          <button
            type="button"
            aria-label="프로필 메뉴"
            className={triggerClassName}
          >
            {avatarBody}
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
        <BeigeActionDropdownItem
          onSelect={() => handleOpenSupport()}
          className="flex flex-row items-center gap-2.5 mt-2"
        >
          <HelpCircle className="h-4 w-4" />
          문의하기
        </BeigeActionDropdownItem>
        <BeigeActionDropdownItem
          onSelect={() => handleOpenUpdateNotes()}
          className="flex flex-row items-center gap-2.5"
        >
          <Scroll className="h-4 w-4" />
          <span className="min-w-0 flex-1">업데이트 노트</span>
        </BeigeActionDropdownItem>
        <BeigeActionDropdownSeparator />
        <BeigeActionDropdownItem
          onSelect={() => {
            logCareerEvent("click_profile_menu_logout");
            void onLogout();
          }}
          tone="danger"
          className="flex flex-row items-center gap-2.5"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </BeigeActionDropdownItem>
      </BeigeActionDropdown>
      <CareerUpdateNotesModal
        open={updateNotesOpen}
        onClose={() => setUpdateNotesOpen(false)}
        onSuggestUpdate={handleSuggestUpdate}
      />
    </>
  );
};

export default React.memo(CareerProfileMenu);
