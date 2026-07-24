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
import { createPortal } from "react-dom";
import { Drawer as DrawerPrimitive } from "vaul";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerProfileSettingsSection from "./CareerProfileSettingsSection";
import { CareerReferralSettingsSection } from "./referral/CareerReferralModal";
import CareerResumeLinksSettingsSection from "./settings/CareerResumeLinksSettingsSection";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";

export type CareerSettingsTab = "profile" | "resume" | "referral" | "account";
type MobileSettingsView = "menu" | CareerSettingsTab;

type SettingsTabDefinition = {
  key: CareerSettingsTab;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const SettingsTabPanel = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: React.ReactNode;
}) => (
  <div className="relative min-h-full px-4 pb-6 pt-4 md:px-8 md:py-7">
    <h2 className="text-base font-medium text-neutral-primary">{title}</h2>
    <div className="mt-5">{children}</div>
  </div>
);

const SettingRow = ({
  action,
  desc,
  title,
  variant = "default",
}: {
  action: React.ReactNode;
  desc?: React.ReactNode;
  title: React.ReactNode;
  variant?: "default" | "critical";
}) => (
  <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
    <div className="min-w-0 flex-1 sm:py-1.5">
      <h3
        className={[
          "text-sm font-normal",
          variant === "critical" ? "text-critical" : "text-neutral-primary",
        ].join(" ")}
      >
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-sm font-normal leading-5 text-neutral-muted">
          {desc}
        </p>
      )}
    </div>
    <div className="w-full shrink-0 sm:w-[360px]">{action}</div>
  </div>
);

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

const normalizeAccountFieldName = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAccountFieldEmail = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const isValidAccountEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type SavedAccountProfile = {
  email: string;
  name: string;
  userId: string;
};

type AccountProfilePayload = {
  error?: string;
  profile?: {
    email?: string | null;
    name?: string | null;
    user_id?: string | null;
  } | null;
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
          <MuteButton
            type="button"
            size="lg"
            onClick={onClose}
            disabled={pending}
            className="text-sm font-medium"
          >
            {t(
              "career.settings.career_settings_modal.keep_account",
              "계정 유지하기"
            )}
          </MuteButton>
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
  name,
  onLogout,
  onProfileSaved,
  userId,
}: {
  email: string;
  name: string;
  onLogout: () => void | Promise<void>;
  onProfileSaved: (profile: {
    email: string | null;
    name: string | null;
    user_id: string;
  }) => void;
  userId: string;
}) => (
  <AccountSectionContent
    key={`${userId}:${normalizeAccountFieldEmail(email)}:${normalizeAccountFieldName(
      name
    )}`}
    email={email}
    name={name}
    onLogout={onLogout}
    onProfileSaved={onProfileSaved}
    userId={userId}
  />
);

const AccountSectionContent = ({
  email,
  name,
  onLogout,
  onProfileSaved,
  userId,
}: {
  email: string;
  name: string;
  onLogout: () => void | Promise<void>;
  onProfileSaved: (profile: {
    email: string | null;
    name: string | null;
    user_id: string;
  }) => void;
  userId: string;
}) => {
  const t = useCareerT();
  const isMobile = useIsMobile();
  const accountNameLabel = t(
    "career.settings.career_settings_modal.account_name",
    "이름"
  );
  const accountEmailLabel = t(
    "career.settings.career_settings_modal.account_email",
    "이메일"
  );

  const { fetchWithAuth } = useCareerApi();
  const logCareerEvent = useCareerLogEvent();
  const [savedProfile, setSavedProfile] = useState<SavedAccountProfile>(() => ({
    email: normalizeAccountFieldEmail(email),
    name: normalizeAccountFieldName(name),
    userId,
  }));
  const [draftName, setDraftName] = useState(savedProfile.name);
  const [draftEmail, setDraftEmail] = useState(savedProfile.email);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const normalizedDraftName = normalizeAccountFieldName(draftName);
  const normalizedDraftEmail = normalizeAccountFieldEmail(draftEmail);
  const hasAccountChanges =
    normalizedDraftName !== savedProfile.name ||
    normalizedDraftEmail !== savedProfile.email;

  const handleSaveAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savePending || !hasAccountChanges) return;

    setSaveError("");
    setSaveInfo("");

    if (!normalizedDraftName) {
      setSaveError(
        t(
          "career.settings.career_settings_modal.account_name_required",
          "이름을 입력해주세요."
        )
      );
      return;
    }
    if (!isValidAccountEmail(normalizedDraftEmail)) {
      setSaveError(
        t(
          "career.settings.career_settings_modal.account_email_invalid",
          "유효한 이메일을 입력해주세요."
        )
      );
      return;
    }

    setSavePending(true);
    logCareerEvent("click_settings_account_save");

    try {
      const response = await fetchWithAuth("/api/talent/account", {
        method: "PUT",
        body: JSON.stringify({
          email: normalizedDraftEmail,
          name: normalizedDraftName,
        }),
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as AccountProfilePayload;

      if (!response.ok) {
        throw new Error(
          payload.error ??
            t(
              "career.settings.career_settings_modal.account_save_failed",
              "계정 정보를 저장하지 못했습니다."
            )
        );
      }

      const profile = payload.profile ?? {};
      const nextSaved = {
        email: normalizeAccountFieldEmail(
          profile.email ?? normalizedDraftEmail
        ),
        name: normalizeAccountFieldName(profile.name ?? normalizedDraftName),
        userId: String(profile.user_id ?? userId),
      };
      setSavedProfile(nextSaved);
      setDraftName(nextSaved.name);
      setDraftEmail(nextSaved.email);
      onProfileSaved({
        email: nextSaved.email,
        name: nextSaved.name,
        user_id: nextSaved.userId,
      });
      setSaveInfo(
        t(
          "career.settings.career_settings_modal.account_saved",
          "계정 정보를 저장했습니다."
        )
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : t(
              "career.settings.career_settings_modal.account_save_failed",
              "계정 정보를 저장하지 못했습니다."
            )
      );
    } finally {
      setSavePending(false);
    }
  };

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
  const saveButton = hasAccountChanges ? (
    <div
      className={
        isMobile
          ? "fixed bottom-1 left-1 right-1 z-[70]"
          : "absolute bottom-4 right-4"
      }
    >
      <BareButton
        type="submit"
        form="career-settings-account-form"
        disabled={savePending}
        className={[
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-black px-4 text-[13px] font-normal text-neutral-00 transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-60",
          isMobile ? "w-full" : "w-auto",
        ].join(" ")}
      >
        {savePending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {savePending
          ? t("career.settings.career_settings_modal.account_saving", "저장 중")
          : t("career.settings.career_settings_modal.account_save", "저장")}
      </BareButton>
    </div>
  ) : null;

  return (
    <>
      <form
        id="career-settings-account-form"
        className={[
          "divide-y divide-neutral-1000-a05",
          hasAccountChanges ? "pb-14" : "",
        ].join(" ")}
        onSubmit={handleSaveAccount}
      >
        <SettingRow
          title={accountNameLabel}
          action={
            <input
              id="career-settings-account-name"
              aria-label={accountNameLabel}
              type="text"
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
                setSaveError("");
                setSaveInfo("");
              }}
              className="h-9 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[13px] text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10"
              autoComplete="name"
            />
          }
        />

        <SettingRow
          title={accountEmailLabel}
          action={
            <input
              id="career-settings-account-email"
              aria-label={accountEmailLabel}
              type="email"
              value={draftEmail}
              onChange={(event) => {
                setDraftEmail(event.target.value);
                setSaveError("");
                setSaveInfo("");
              }}
              className="h-9 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-[13px] text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a10"
              autoComplete="email"
            />
          }
        />

        {saveError || saveInfo ? (
          <div className="py-4 sm:ml-auto sm:w-[360px]">
            {saveError ? (
              <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
                {saveError}
              </p>
            ) : null}
            {saveInfo ? (
              <p className="rounded-lg border border-neutral-1000-a05 bg-bg-weak px-3 py-2 text-sm text-neutral-muted">
                {saveInfo}
              </p>
            ) : null}
          </div>
        ) : null}

        <SettingRow
          title={t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
          action={
            <div className="flex sm:justify-end">
              <MuteButton
                type="button"
                onClick={() => {
                  logCareerEvent("click_settings_logout");
                  void onLogout();
                }}
                className="gap-2 text-sm"
              >
                <LogOut className="h-4 w-4" />
                {t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
              </MuteButton>
            </div>
          }
        />

        <SettingRow
          title={t(
            "career.settings.career_settings_modal.1ba4567",
            "회원 탈퇴"
          )}
          desc={t(
            "career.settings.career_settings_modal.0858bd9",
            "탈퇴하면 계정과 커리어 프로필, 이력서, 대화/추천 데이터가 삭제됩니다. 다시 되돌릴 수 없습니다."
          )}
          variant="critical"
          action={
            <div className="flex sm:justify-end">
              <MuteButton
                type="button"
                variant="warn"
                onClick={handleOpenDeleteConfirm}
                className="gap-2 text-sm font-medium"
              >
                <Trash2 className="h-4 w-4" />
                {t(
                  "career.settings.career_settings_modal.1ba4567",
                  "회원 탈퇴"
                )}
              </MuteButton>
            </div>
          }
        />
      </form>

      {isMobile && saveButton && typeof document !== "undefined"
        ? createPortal(saveButton, document.body)
        : saveButton}

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
  account: {
    email: string;
    name: string;
    userId: string;
  },
  onLogout: () => void | Promise<void>,
  onProfileSaved: (profile: {
    email: string | null;
    name: string | null;
    user_id: string;
  }) => void
) => {
  if (tab === "profile") return <CareerProfileSettingsSection />;
  if (tab === "resume") return <CareerResumeLinksSettingsSection />;
  if (tab === "referral") return <CareerReferralSettingsSection />;
  return (
    <AccountSection
      email={account.email}
      name={account.name}
      onLogout={onLogout}
      onProfileSaved={onProfileSaved}
      userId={account.userId}
    />
  );
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
  const {
    onLogout,
    onUpdateAccountProfile,
    preferredLocale,
    talentProfile,
    user,
  } = useCareerSidebarContext();
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

  const accountEmail =
    talentProfile.talentUser?.email ??
    user?.email ??
    t("career.settings.career_settings_modal.0zjg8a0", "로그인 중");
  const accountName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "");
  const account = {
    email: accountEmail,
    name: accountName,
    userId: talentProfile.talentUser?.user_id ?? user?.id ?? "",
  };
  const renderTabPanel = (tab: CareerSettingsTab) => {
    const title =
      settingsTabs.find((settingsTab) => settingsTab.key === tab)?.label ??
      (tab === "referral" ? t("career.referral.menu.invite", "초대하기") : "");

    return (
      <SettingsTabPanel title={title}>
        {renderSection(tab, account, onLogout, onUpdateAccountProfile)}
      </SettingsTabPanel>
    );
  };

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
                  <MuteButton
                    type="button"
                    variant="transparent"
                    onClick={handleBackToMenu}
                    className="min-h-11 min-w-11 gap-1 text-sm"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t("career.settings.career_settings_modal.1338q8i", "설정")}
                  </MuteButton>
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
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {renderTabPanel(mobileView)}
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
      closeButtonAriaLabel={t("career.common.career.16x7oad", "설정 닫기")}
    >
      <section className="h-full">
        <div className="grid h-full grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-r border-neutral-1000-a05 bg-bg-basement p-2">
            <nav className="mt-2 space-y-1">
              <MuteButton
                type="button"
                variant="transparent"
                onClick={handleClose}
                className="gap-1 text-[13px]"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("career.settings.career_settings_modal.0poe6eq", "뒤로")}
              </MuteButton>
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
                        ? "bg-neutral-200 text-black"
                        : "text-neutral-primary hover:bg-bg-weak",
                    ].join(" ")}
                  >
                    <tab.Icon className="h-4 w-4" />
                    {tab.label}
                  </BareButton>
                );
              })}
            </nav>
          </aside>

          <div className="h-full overflow-y-auto bg-bg-floating">
            {renderTabPanel(activeTab)}
          </div>
        </div>
      </section>
    </TalentCareerModal>
  );
};

export default CareerSettingsModal;
