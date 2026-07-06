import {
  Check,
  ChevronDown,
  Compass,
  ExternalLink,
  HelpCircle,
  Info,
  Landmark,
  Languages,
  Loader2,
  LogOut,
  MessageCircle,
  Rotate3D,
} from "lucide-react";
import React, { useState } from "react";
import CareerUpdateNotesModal from "./CareerUpdateNotesModal";
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
import { BareButton, Button, CardButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useMessages, type Locale } from "@/i18n/useMessage";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { Text } from "@/components/ui/text";
import Image from "next/image";

type CareerProfileMenuVariant = "desktop" | "mobile";

const PROFILE_LOCALE_OPTIONS: readonly {
  value: Locale;
}[] = [{ value: "en" }, { value: "ko" }];

const getProfileLocaleOptionLabel = (
  value: Locale,
  t: ReturnType<typeof useCareerT>
) => {
  if (value === "ko") return t("ui.1787f9e", "한국어");
  return "English";
};

const aboutMenuItemClassName =
  "flex py-2 cursor-pointer items-center gap-2.5 rounded-[8px] px-3 text-sm text-neutral-primary outline-none transition-colors focus:bg-bg-basement focus:text-neutral-primary";

const aboutSubmenuClassName =
  "w-[248px] rounded-[12px] border border-neutral-1000-a05 bg-bg-floating/95 p-1 text-neutral-primary shadow-[0_18px_40px_rgba(31,28,26,0.12)] backdrop-blur-md";

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
  const { fetchWithAuth } = useCareerApi();
  const { locale, setLocale } = useMessages();
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutMenuOpen, setAboutMenuOpen] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const [languagePending, setLanguagePending] = useState<Locale | null>(null);
  const [updateNotesOpen, setUpdateNotesOpen] = useState(false);

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

  const handleOpenUpdateNotes = () => {
    logCareerEvent("click_profile_menu_update_notes");
    setUpdateNotesOpen(true);
    closeMenu();
  };

  const handleSuggestUpdate = () => {
    setUpdateNotesOpen(false);
    closeMenu();
    onSuggestUpdate();
  };

  const handleOpenSupport = () => {
    logCareerEvent("click_profile_menu_support");
    closeMenu();
    onSuggestUpdate();
  };

  const handleOpenLanguageModal = () => {
    logCareerEvent("click_profile_menu_language");
    setLanguageError("");
    closeMenu();
    setLanguageModalOpen(true);
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

  const handleLocaleSelect = async (nextLocale: Locale) => {
    if (languagePending) return;
    if (nextLocale === locale) {
      setLanguageModalOpen(false);
      return;
    }

    const previousLocale = locale;
    setLanguagePending(nextLocale);
    setLanguageError("");
    setLocale(nextLocale);
    logCareerEvent(`click_profile_menu_language_${nextLocale}`);

    try {
      const response = await fetchWithAuth("/api/talent/settings", {
        method: "POST",
        body: JSON.stringify({ preferredLocale: nextLocale }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ||
            t(
              "career.profile.language_selector.save_failed",
              "언어 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
        );
      }
      setLanguageModalOpen(false);
    } catch (error) {
      setLocale(previousLocale);
      setLanguageError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.language_selector.save_failed",
              "언어 설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
            )
      );
    } finally {
      setLanguagePending((current) =>
        current === nextLocale ? null : current
      );
    }
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
        align="end"
        side="bottom"
        sideOffset={isMobile ? 8 : 12}
        contentClassName="w-[236px]"
        trigger={
          <BareButton
            type="button"
            aria-label={"프로필 메뉴"}
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
          onSelect={() => handleOpenLanguageModal()}
          className="flex flex-row items-center gap-2.5"
        >
          <Languages className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            {t("career.profile.language_selector.menu_label", "언어 설정")}
          </span>
        </ActionDropdownItem>
        {/* <ActionDropdownItem
          onSelect={() => handleOpenUpdateNotes()}
          className="flex flex-row items-center gap-2.5"
        >
          <Scroll className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            {t("career.profile.career_profile_menu.14ybad0", "업데이트 노트")}
          </span>
        </ActionDropdownItem> */}
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
                className="mt-1 rounded-[10px] bg-bg-basement/70 p-1"
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
      <CareerUpdateNotesModal
        open={updateNotesOpen}
        onClose={() => setUpdateNotesOpen(false)}
        onSuggestUpdate={handleSuggestUpdate}
      />
      <TalentCareerModal
        open={languageModalOpen}
        onClose={() => {
          if (languagePending) return;
          setLanguageModalOpen(false);
        }}
        ariaLabel={"언어 설정"}
        panelClassName="w-[min(420px,calc(100vw-32px))] rounded-xl border-neutral-1000-a05 bg-bg-floating"
        bodyClassName="p-0"
        closeButtonClassName="right-3.5 top-3.5 rounded-md text-neutral-soft hover:bg-bg-weak hover:text-neutral-primary"
        closeOnBackdrop={!languagePending}
      >
        <section className="text-neutral-primary">
          <header className="border-b border-neutral-1000-a05 px-5 pb-4 pt-5">
            <Text as="h2" type="head2" className="pr-10">
              {t("career.profile.language_selector.modal_title", "언어 설정")}
            </Text>
            <Text type="desc" className="mt-2 text-neutral-muted">
              {t(
                "career.profile.language_selector.modal_description",
                "Harper가 사용할 언어를 선택하세요."
              )}
            </Text>
          </header>
          <div className="space-y-1.5 px-5 py-4">
            {PROFILE_LOCALE_OPTIONS.map((option) => {
              const selected = locale === option.value;
              const pending = languagePending === option.value;

              return (
                <CardButton
                  key={option.value}
                  selected={selected}
                  disabled={Boolean(languagePending)}
                  onClick={() => void handleLocaleSelect(option.value)}
                  className="min-h-[44px] items-center justify-between rounded-md px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-weak text-[11.5px] font-semibold text-neutral-primary">
                      {option.value.toUpperCase()}
                    </span>
                    <span className="min-w-0 text-[13px] font-medium text-neutral-primary">
                      {getProfileLocaleOptionLabel(option.value, t)}
                    </span>
                  </span>
                  {pending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-muted" />
                  ) : selected ? (
                    <Check className="h-3.5 w-3.5 text-neutral-primary" />
                  ) : null}
                </CardButton>
              );
            })}
            {languageError ? (
              <div className="rounded-md border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
                {languageError}
              </div>
            ) : null}
          </div>
          <footer className="flex justify-end border-t border-neutral-1000-a05 px-5 py-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={Boolean(languagePending)}
              onClick={() => setLanguageModalOpen(false)}
            >
              {t("career.profile.language_selector.close", "닫기")}
            </Button>
          </footer>
        </section>
      </TalentCareerModal>
    </>
  );
};

export default React.memo(CareerProfileMenu);
