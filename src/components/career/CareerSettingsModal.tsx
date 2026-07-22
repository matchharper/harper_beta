import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Loader2,
  LogOut,
  Settings2,
  Trash2,
  UserCircle2,
  UserRoundPlus,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerProfileSettingsSection from "./CareerProfileSettingsSection";
import { CareerReferralSettingsSection } from "./referral/CareerReferralModal";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";

export type CareerSettingsTab = "profile" | "resume" | "referral" | "account";
type MobileSettingsView = "menu" | CareerSettingsTab;

type SettingsTabDefinition = {
  key: CareerSettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const getSettingsTabs = (
  t: ReturnType<typeof useCareerT>,
  showReferralEntryPoints: boolean
): SettingsTabDefinition[] => {
  const tabs: SettingsTabDefinition[] = [
    {
      key: "profile",
      label: t("career.settings.career_settings_modal.0tdjt8e", "프로필 설정"),
      Icon: Settings2,
    },
    {
      key: "resume",
      label: t(
        "career.settings.career_settings_modal.1u81q4e",
        "내 이력서/링크"
      ),
      Icon: FileText,
    },
  ];

  if (showReferralEntryPoints) {
    tabs.push({
      key: "referral",
      label: t("career.referral.menu.invite", "초대하기"),
      Icon: UserRoundPlus,
    });
  }

  tabs.push({
    key: "account",
    label: t("career.settings.career_settings_modal.1lbfn2i", "계정 관리"),
    Icon: UserCircle2,
  });

  return tabs;
};

const MENU_SNAP = "340px";
const FULL_SNAP = 0.95;
const SETTINGS_SNAP_POINTS: Array<number | string> = [MENU_SNAP, FULL_SNAP];
const ACCOUNT_DELETE_CONFIRMATION = "delete_account";

const getAccountDeleteErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
};

const AccountDeleteConfirmDialog = ({
  error,
  open,
  pending,
  onClose,
  onConfirm,
}: {
  error: string;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const t = useCareerT();

  useEffect(() => {
    if (!open || pending) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="career-account-delete-title"
    >
      <BareButton
        type="button"
        aria-label={"회원 탈퇴 확인 닫기"}
        className="absolute inset-0 bg-black/45"
        onClick={pending ? undefined : onClose}
      />
      <div className="relative z-[81] w-full max-w-[440px] rounded-[16px] border border-critical/30 bg-bg-floating p-5 shadow-[0_24px_80px_color-mix(in_srgb,var(--color-neutral-1000)_24%,transparent)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-critical-faded text-critical">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3
              id="career-account-delete-title"
              className="text-base font-semibold text-neutral-primary"
            >
              {t(
                "career.settings.career_settings_modal.0j4pj4h",
                "회원 탈퇴를 진행할까요?"
              )}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-muted">
              {t(
                "career.settings.career_settings_modal.1stwtug",
                "탈퇴하면 계정 접근 권한, 커리어 프로필, 이력서, 대화 기록, 추천/설정 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
              )}
            </p>
            <p className="mt-2 text-sm font-medium text-critical">
              {t(
                "career.settings.career_settings_modal.1hdokry",
                "삭제된 데이터는 복구할 수 없습니다."
              )}
            </p>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <BareButton
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-neutral-muted transition-colors hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t(
              "career.settings.career_settings_modal.keep_account",
              "계정 유지하기"
            )}
          </BareButton>
          <BareButton
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-critical px-4 text-sm font-semibold text-neutral-00 transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {pending
              ? t(
                  "career.settings.career_settings_modal.1vqjolg",
                  "탈퇴 처리 중"
                )
              : t("career.settings.career_settings_modal.0tel9h5", "탈퇴하기")}
          </BareButton>
        </div>
      </div>
    </div>
  );
};

const AccountSection = ({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void | Promise<void>;
}) => <AccountSectionContent email={email} onLogout={onLogout} />;

const AccountSectionContent = ({
  email,
  onLogout,
}: {
  email: string;
  onLogout: () => void | Promise<void>;
}) => {
  const t = useCareerT();

  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleOpenDeleteConfirm = () => {
    logCareerEvent("click_settings_delete_account");
    setDeleteError("");
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletePending) return;

    setDeletePending(true);
    setDeleteError("");
    logCareerEvent("confirm_settings_delete_account");

    try {
      const response = await fetchWithAuth("/api/talent/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: ACCOUNT_DELETE_CONFIRMATION,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ??
            t(
              "career.settings.career_settings_modal.1b7saeu",
              "회원 탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
            )
        );
      }

      setDeleteConfirmOpen(false);
      await onLogout();
    } catch (error) {
      setDeleteError(
        getAccountDeleteErrorMessage(
          error,
          t(
            "career.settings.career_settings_modal.1b7saeu",
            "회원 탈퇴 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요."
          )
        )
      );
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-primary">
            {t("career.settings.career_settings_modal.1lbfn2i", "계정 관리")}
          </h2>
          <p className="mt-1 text-sm text-neutral-soft">
            {t(
              "career.settings.career_settings_modal.1vcdzyt",
              "계정 세션과 가입 상태를 관리합니다."
            )}
          </p>
        </div>

        <p className="text-sm text-neutral-muted">{email}</p>
        <BareButton
          type="button"
          onClick={() => {
            logCareerEvent("click_settings_logout");
            void onLogout();
          }}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-1000-a05 bg-bg-floating px-4 text-sm text-neutral-muted transition-colors hover:border-neutral-800 hover:bg-bg-weak hover:text-neutral-primary"
        >
          <LogOut className="h-4 w-4" />
          {t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
        </BareButton>

        <div className="border-t border-neutral-1000-a05 pt-4">
          <h3 className="text-sm font-semibold text-critical">
            {t("career.settings.career_settings_modal.1ba4567", "회원 탈퇴")}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-neutral-soft">
            {t(
              "career.settings.career_settings_modal.0858bd9",
              "탈퇴하면 계정과 커리어 프로필, 이력서, 대화/추천 데이터가 삭제됩니다. 다시 되돌릴 수 없습니다."
            )}
          </p>
          <BareButton
            type="button"
            onClick={handleOpenDeleteConfirm}
            className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-critical px-3 text-sm font-medium text-neutral-00 transition-colors hover:opacity-90"
          >
            <Trash2 className="h-4 w-4" />
            {t("career.settings.career_settings_modal.1ba4567", "회원 탈퇴")}
          </BareButton>
        </div>
      </div>

      <AccountDeleteConfirmDialog
        error={deleteError}
        open={deleteConfirmOpen}
        pending={deletePending}
        onClose={() => {
          if (deletePending) return;
          setDeleteConfirmOpen(false);
          setDeleteError("");
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
};

const renderSection = (
  tab: CareerSettingsTab,
  email: string,
  onLogout: () => void | Promise<void>
) => {
  if (tab === "profile") return <CareerProfileSettingsSection />;
  if (tab === "resume") return <CareerResumeLinksSettingsSection />;
  if (tab === "referral") return <CareerReferralSettingsSection />;
  return <AccountSection email={email} onLogout={onLogout} />;
};

const CareerSettingsModal = ({
  initialTab,
  open,
  onClose,
}: {
  initialTab?: CareerSettingsTab | null;
  open: boolean;
  onClose: () => void;
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const { onLogout, preferredLocale, talentProfile, user } =
    useCareerSidebarContext();
  const showReferralEntryPoints = useReferralEntryPointEligibility({
    currentLocation: talentProfile.talentUser?.current_location,
    location: talentProfile.talentUser?.location,
    preferredLocale,
    user,
  });
  const settingsTabs = useMemo(
    () => getSettingsTabs(t, showReferralEntryPoints),
    [showReferralEntryPoints, t]
  );
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState<CareerSettingsTab>("profile");
  const [mobileView, setMobileView] = useState<MobileSettingsView>("menu");
  const [snap, setSnap] = useState<number | string | null>(MENU_SNAP);

  const resetMobileSettings = useCallback(() => {
    setMobileView("menu");
    setSnap(MENU_SNAP);
    setActiveTab("profile");
  }, []);

  const handleClose = useCallback(() => {
    logCareerEvent("click_settings_close");
    onClose();
    resetMobileSettings();
  }, [logCareerEvent, onClose, resetMobileSettings]);

  useEffect(() => {
    if (!open) return;
    if (user) return;
    onClose();
    const timer = window.setTimeout(resetMobileSettings, 0);
    return () => window.clearTimeout(timer);
  }, [onClose, open, resetMobileSettings, user]);

  useEffect(() => {
    if (!open || !initialTab) return;
    const timer = window.setTimeout(() => {
      setActiveTab(initialTab);
      if (!isMobile) return;
      setMobileView(initialTab);
      setSnap(FULL_SNAP);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialTab, isMobile, open]);

  const email =
    user?.email ??
    t("career.settings.career_settings_modal.0zjg8a0", "로그인 중");

  if (isMobile) {
    const handleOpenChange = (nextOpen: boolean) => {
      if (!nextOpen) handleClose();
    };

    const handleSelectTab = (tab: CareerSettingsTab) => {
      logCareerEvent(`click_settings_tab_${tab}`);
      setActiveTab(tab);
      setMobileView(tab);
      setSnap(FULL_SNAP);
    };

    const handleBackToMenu = () => {
      logCareerEvent("click_settings_back_to_menu");
      setMobileView("menu");
      setSnap(MENU_SNAP);
    };

    return (
      <DrawerPrimitive.Root
        open={open}
        onOpenChange={handleOpenChange}
        snapPoints={SETTINGS_SNAP_POINTS}
        activeSnapPoint={snap}
        setActiveSnapPoint={setSnap}
        fadeFromIndex={0}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DrawerPrimitive.Content
            className="fixed inset-x-0 bottom-0 z-50 flex h-full max-h-[97svh] flex-col rounded-t-[20px] border-t border-neutral-1000-a05 bg-bg-floating text-neutral-primary outline-none"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <DrawerPrimitive.Title className="sr-only">
              {t(
                "career.settings.career_settings_modal.11hatjy",
                "커리어 설정"
              )}
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Description className="sr-only">
              {t(
                "career.settings.career_settings_modal.18qhozv",
                "아래로 드래그하면 메뉴 크기로 축소되고, 위로 드래그하면 전체화면으로 확장됩니다."
              )}
            </DrawerPrimitive.Description>

            <div className="flex shrink-0 justify-center pt-3 pb-2">
              <div className="h-1.5 w-12 rounded-full bg-black/20" />
            </div>

            {mobileView === "menu" ? (
              <>
                <header className="flex shrink-0 items-center justify-between px-5 pb-2">
                  <h2 className="font-instrument text-[22px] leading-none text-neutral-primary">
                    {t("career.settings.career_settings_modal.1338q8i", "설정")}
                  </h2>
                  <DrawerPrimitive.Close
                    aria-label={"설정 닫기"}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-muted transition-colors hover:bg-bg-weak hover:text-neutral-primary"
                  >
                    <X className="h-4 w-4" />
                  </DrawerPrimitive.Close>
                </header>
                <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-6 pt-2">
                  {settingsTabs.map((tab) => (
                    <BareButton
                      key={tab.key}
                      type="button"
                      onClick={() => handleSelectTab(tab.key)}
                      className="flex w-full min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-3 text-left text-[15px] text-neutral-primary transition-colors hover:bg-bg-weak active:bg-bg-weak"
                    >
                      <span className="flex items-center gap-3">
                        <tab.Icon className="h-5 w-5 text-neutral-muted" />
                        {tab.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-neutral-soft" />
                    </BareButton>
                  ))}
                </nav>
              </>
            ) : (
              <>
                <header className="flex shrink-0 items-center justify-between border-b border-neutral-1000-a05 px-3 pb-2">
                  <BareButton
                    type="button"
                    onClick={handleBackToMenu}
                    className="inline-flex min-h-11 min-w-11 items-center gap-1 rounded-lg px-2 text-sm text-neutral-muted transition-colors hover:text-neutral-primary"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("career.settings.career_settings_modal.1338q8i", "설정")}
                  </BareButton>
                  <h2 className="text-[15px] font-semibold text-neutral-primary">
                    {settingsTabs.find((tab) => tab.key === mobileView)
                      ?.label ??
                      (mobileView === "referral"
                        ? t("career.referral.menu.invite", "초대하기")
                        : null)}
                  </h2>
                  <DrawerPrimitive.Close
                    aria-label={"설정 닫기"}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-muted transition-colors hover:bg-bg-weak hover:text-neutral-primary"
                  >
                    <X className="h-4 w-4" />
                  </DrawerPrimitive.Close>
                </header>
                <div
                  className={[
                    "min-h-0 flex-1 overflow-y-auto",
                    mobileView === "referral"
                      ? "px-0 pb-0 pt-0"
                      : "px-4 pb-6 pt-4",
                  ].join(" ")}
                >
                  {renderSection(mobileView, email, onLogout)}
                </div>
              </>
            )}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={handleClose}
      ariaLabel={"커리어 설정"}
      overlayClassName="items-start pt-14"
      panelClassName="max-w-none h-[80svh] max-h-[860px] px-0 w-[min(1040px,90vw)]"
      bodyClassName="h-full p-0"
      closeButtonClassName="right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-800 hover:bg-bg-weak hover:text-neutral-primary"
      closeButtonAriaLabel={t("career.common.career.16x7oad", "설정 닫기")}
    >
      <section className="h-full">
        <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-neutral-1000-a05 bg-bg-basement p-2">
            <nav className="mt-2 space-y-1">
              <BareButton
                type="button"
                onClick={handleClose}
                className="px-3 py-0 inline-flex items-center gap-1 text-[13px] text-neutral-soft transition-colors hover:text-neutral-primary"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("career.settings.career_settings_modal.0poe6eq", "뒤로")}
              </BareButton>
              {settingsTabs.map((tab) => {
                const isActive = tab.key === activeTab;
                return (
                  <BareButton
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      logCareerEvent(`click_settings_tab_${tab.key}`);
                      setActiveTab(tab.key);
                    }}
                    className={[
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-bg-floating text-neutral-primary"
                        : "text-neutral-muted hover:bg-bg-weak",
                    ].join(" ")}
                  >
                    <tab.Icon className="h-4 w-4" />
                    {tab.label}
                  </BareButton>
                );
              })}
            </nav>
          </aside>

          <div
            className={[
              "h-full overflow-y-auto bg-bg-floating",
              activeTab === "referral" ? "px-0 py-0" : "px-8 py-7",
            ].join(" ")}
          >
            {renderSection(activeTab, email, onLogout)}
          </div>
        </div>
      </section>
    </TalentCareerModal>
  );
};

export default CareerSettingsModal;
