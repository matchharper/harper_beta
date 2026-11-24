import { CareerAutomationSettingsSection } from "./CareerAutomationSettingsSection";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  ChevronRight,
  ExternalLink,
  FileText,
  HelpCircle,
  Landmark,
  Loader2,
  LogOut,
  MessageCircle,
  ScrollText,
  SlidersHorizontal,
  TextSelect,
  Trash2,
  User,
  UserCircle2,
} from "lucide-react";
import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useFloatingPortalContainer } from "@/components/ui/floating-portal";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import {
  useCareerProfileContext,
  useCareerSidebarContext,
} from "./CareerSidebarContext";
import CareerOpportunitySettingsSection from "./settings/CareerOpportunitySettingsSection";
import CareerLanguageSetting from "./settings/CareerLanguageSetting";
import CareerCrmBroadcastSetting from "./settings/CareerCrmBroadcastSetting";
import { CareerSettingRow as SettingRow } from "./settings/CareerSettingRow";
import { GroupedList, GroupedListRow } from "@/components/ui/grouped-list";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import CareerEmailChangeModal from "./account/CareerEmailChangeModal";
import CareerSupportInquiryModal from "./CareerSupportInquiryModal";
import type { CareerWorkspaceTab } from "./CareerWorkspaceNav";
import {
  getAuthenticatedUserProfileImageUrl,
  getCareerMenuProfileImageUrl,
} from "./profileAvatar";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  ACCOUNT_DELETION_DETAIL_MAX_LENGTH,
  type AccountDeletionReasonCode,
} from "@/lib/career/accountDeletionFeedback";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type CareerSettingsTab = "profile" | "account" | "automation";

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
    <h2 className="hidden text-base font-medium text-neutral-primary md:block">
      {title}
    </h2>
    <div className="md:mt-5">{children}</div>
  </div>
);

const getSettingsTabs = (t: ReturnType<typeof useCareerT>): SettingsTabDefinition[] => [
  {
    key: "profile",
    label: t("career.settings.career_settings_modal.0tdjt8e", "기회 설정"),
    Icon: SlidersHorizontal,
  },
  {
    key: "account",
    label: t("career.settings.career_settings_modal.1lbfn2i", "계정"),
    Icon: UserCircle2,
  },
];

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
  detail,
  error,
  open,
  pending,
  reason,
  onClose,
  onConfirm,
  onDetailChange,
  onReasonChange,
}: {
  detail: string;
  error: string;
  open: boolean;
  pending: boolean;
  reason: AccountDeletionReasonCode | "";
  onClose: () => void;
  onConfirm: () => void;
  onDetailChange: (value: string) => void;
  onReasonChange: (value: AccountDeletionReasonCode | "") => void;
}) => {
  const t = useCareerT();
  const reasonOptions: Array<{
    label: string;
    value: AccountDeletionReasonCode;
  }> = [
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_missing_opportunities",
        "원하는 기회나 추천을 찾지 못했어요"
      ),
      value: "missing_opportunities",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_recommendation_quality",
        "추천 품질이 기대와 달랐어요"
      ),
      value: "recommendation_quality",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_infrequent_use",
        "서비스를 자주 사용하지 않아요"
      ),
      value: "infrequent_use",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_difficult_to_use",
        "서비스 이용이 불편하거나 어려웠어요"
      ),
      value: "difficult_to_use",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_privacy_concern",
        "개인정보가 걱정돼요"
      ),
      value: "privacy_concern",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_new_account",
        "다른 계정으로 다시 가입하려고 해요"
      ),
      value: "new_account",
    },
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_other",
        "기타"
      ),
      value: "other",
    },
  ];
  const selectItems = [
    {
      label: t(
        "career.settings.career_settings_modal.delete_reason_placeholder",
        "(선택) 탈퇴 이유를 선택해주세요"
      ),
      value: "",
    },
    ...reasonOptions,
  ];

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
        aria-label={t(
          "career.settings.career_settings_modal.11q4o0j",
          "회원 탈퇴 확인 닫기"
        )}
        className="absolute inset-0 bg-surface-inverse/45"
        onClick={pending ? undefined : onClose}
      />
      <div className="relative font-normal z-[81] max-h-[calc(100dvh-2rem)] w-full max-w-[440px] overflow-y-auto rounded-xl border border-critical/30 bg-bg-floating p-5 shadow-(--shadow-modal)">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-critical-faded text-critical">
            <AlertTriangle className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <h3
              id="career-account-delete-title"
              className="text-base font-medium text-neutral-primary"
            >
              {t(
                "career.settings.career_settings_modal.0j4pj4h",
                "회원 탈퇴를 진행할까요?"
              )}
            </h3>
            <p className="mt-2 text-sm text-neutral-muted">
              {t(
                "career.settings.career_settings_modal.1stwtug",
                "탈퇴하면 계정 접근 권한, 커리어 프로필, 이력서, 대화 기록, 추천/설정 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다."
              )}
            </p>
            <p className="mt-2 text-sm text-critical">
              {t(
                "career.settings.career_settings_modal.1hdokry",
                "삭제된 데이터는 복구할 수 없습니다."
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="career-account-delete-reason"
              className="mb-1.5 block text-xs md:text-sm font-normal text-neutral-primary"
            >
              {t(
                "career.settings.career_settings_modal.delete_reason_label",
                "탈퇴 사유에 대해서 공유해주시면 감사드리겠습니다."
              )}
            </label>
            <Select
              items={selectItems}
              value={reason}
              onValueChange={(value) => {
                onReasonChange((value ?? "") as AccountDeletionReasonCode | "");
              }}
              disabled={pending}
            >
              <SelectTrigger id="career-account-delete-reason">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value="">
                  {t(
                    "career.settings.career_settings_modal.delete_reason_placeholder",
                    "(선택) 탈퇴 이유를 선택해주세요"
                  )}
                </SelectItem>
                {reasonOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label
              htmlFor="career-account-delete-detail"
              className="mb-1.5 block text-xs md:text-sm font-normal text-neutral-primary"
            >
              {t(
                "career.settings.career_settings_modal.delete_reason_detail_label",
                "조금 더 알려주세요"
              )}
            </label>
            <Textarea
              id="career-account-delete-detail"
              value={detail}
              onChange={(event) => onDetailChange(event.target.value)}
              disabled={pending}
              maxLength={ACCOUNT_DELETION_DETAIL_MAX_LENGTH}
              rows={3}
              placeholder={t(
                "career.settings.career_settings_modal.delete_reason_detail_placeholder",
                "Harper가 개선할 수 있도록 의견을 남겨주세요."
              )}
            />
            <p className="mt-1 text-right text-xs text-neutral-soft">
              {detail.length}/{ACCOUNT_DELETION_DETAIL_MAX_LENGTH}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

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
          <MuteButton
            type="button"
            variant="warn"
            size="lg"
            onClick={onConfirm}
            disabled={pending}
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
          </MuteButton>
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
  const portalContainer = useFloatingPortalContainer();
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
  const [emailChangeModalOpen, setEmailChangeModalOpen] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveInfo, setSaveInfo] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteReason, setDeleteReason] = useState<
    AccountDeletionReasonCode | ""
  >("");
  const [deleteReasonDetail, setDeleteReasonDetail] = useState("");
  const [deleteFeedbackSubmissionId, setDeleteFeedbackSubmissionId] =
    useState("");

  const normalizedDraftName = normalizeAccountFieldName(draftName);
  const hasAccountChanges = normalizedDraftName !== savedProfile.name;
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
    setSavePending(true);
    logCareerEvent("click_settings_account_save");

    try {
      const response = await fetchWithAuth("/api/talent/account", {
        method: "PUT",
        body: JSON.stringify({
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
        email: normalizeAccountFieldEmail(profile.email ?? savedProfile.email),
        name: normalizeAccountFieldName(profile.name ?? normalizedDraftName),
        userId: String(profile.user_id ?? userId),
      };
      setSavedProfile(nextSaved);
      setDraftName(nextSaved.name);
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
    setDeleteReason("");
    setDeleteReasonDetail("");
    setDeleteFeedbackSubmissionId(crypto.randomUUID());
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deletePending || !deleteFeedbackSubmissionId) return;

    setDeletePending(true);
    setDeleteError("");
    logCareerEvent("confirm_settings_delete_account");

    try {
      const response = await fetchWithAuth("/api/talent/account", {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: ACCOUNT_DELETE_CONFIRMATION,
          feedback: {
            detail: deleteReasonDetail,
            reasonCode: deleteReason,
            submissionId: deleteFeedbackSubmissionId,
          },
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
  const handleLogout = () => {
    logCareerEvent("click_settings_logout");
    void onLogout();
  };
  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraftName(event.target.value);
    setSaveError("");
    setSaveInfo("");
  };
  const logoutLabel = t(
    "career.profile.career_profile_menu.1k7ppv0",
    "로그아웃"
  );
  const deleteLabel = t(
    "career.settings.career_settings_modal.1ba4567",
    "회원 탈퇴"
  );
  const saveFeedback =
    saveError || saveInfo ? (
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
    ) : null;
  const saveButton = hasAccountChanges ? (
    <div
      className={
        isMobile
          ? "absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-10"
          : "absolute bottom-4 right-4"
      }
    >
      <BareButton
        type="submit"
        form="career-settings-account-form"
        disabled={savePending}
        className={[
          "pointer-events-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-surface-inverse px-4 text-[13px] font-normal text-neutral-00 transition-colors hover:bg-surface-inverse/85 disabled:cursor-not-allowed disabled:opacity-60",
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
          isMobile ? "space-y-4" : "divide-y divide-neutral-1000-a05",
          hasAccountChanges ? "pb-14" : "",
        ].join(" ")}
        onSubmit={handleSaveAccount}
      >
        {isMobile ? (
          <>
            <GroupedList>
              <GroupedListRow asChild className="gap-3">
                <label htmlFor="career-settings-account-name">
                  <span className="shrink-0">{accountNameLabel}</span>
                  <input
                    id="career-settings-account-name"
                    aria-label={accountNameLabel}
                    autoComplete="name"
                    value={draftName}
                    onChange={handleNameChange}
                    className="min-w-0 flex-1 bg-transparent text-right text-base text-neutral-muted outline-none focus:text-neutral-primary focus-visible:underline"
                  />
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-neutral-soft"
                  />
                </label>
              </GroupedListRow>
              <GroupedListRow asChild className="gap-3">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => setEmailChangeModalOpen(true)}
                >
                  <span className="shrink-0">{accountEmailLabel}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-neutral-muted">
                    {savedProfile.email}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-neutral-soft"
                  />
                </button>
              </GroupedListRow>
              <CareerLanguageSetting grouped />
              <CareerCrmBroadcastSetting grouped />
            </GroupedList>
            {saveFeedback}
            <div className="flex flex-col items-start px-5">
              <BareButton
                type="button"
                onClick={handleOpenDeleteConfirm}
                className="min-h-11 text-sm text-critical"
              >
                {deleteLabel}
              </BareButton>
            </div>
          </>
        ) : (
          <>
            <SettingRow
              title={accountNameLabel}
              action={
                <input
                  id="career-settings-account-name"
                  aria-label={accountNameLabel}
                  type="text"
                  value={draftName}
                  onChange={handleNameChange}
                  className="h-9 w-full rounded-control border border-stroke bg-control bg-control-image px-3 text-[13px] text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder focus:border-stroke-focus focus:ring-2 focus:ring-focus-ring"
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
                  aria-haspopup="dialog"
                  type="email"
                  readOnly
                  value={savedProfile.email}
                  onClick={() => setEmailChangeModalOpen(true)}
                  className="h-9 w-full cursor-pointer rounded-control border border-stroke bg-control bg-control-image px-3 text-[13px] text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder hover:border-neutral-400 focus:border-stroke-focus focus:ring-2 focus:ring-focus-ring"
                  autoComplete="email"
                />
              }
            />

            {saveFeedback}
            <CareerLanguageSetting />

            <CareerCrmBroadcastSetting />

            <SettingRow
              title={logoutLabel}
              action={
                <div className="flex sm:justify-end">
                  <MuteButton
                    type="button"
                    onClick={handleLogout}
                    className="gap-2 text-sm"
                  >
                    <LogOut className="h-4 w-4" />
                    {logoutLabel}
                  </MuteButton>
                </div>
              }
            />

            <SettingRow
              title={deleteLabel}
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
                    {deleteLabel}
                  </MuteButton>
                </div>
              }
            />
          </>
        )}
      </form>

      {isMobile && saveButton && portalContainer
        ? createPortal(saveButton, portalContainer)
        : saveButton}

      <AccountDeleteConfirmDialog
        detail={deleteReasonDetail}
        error={deleteError}
        open={deleteConfirmOpen}
        pending={deletePending}
        reason={deleteReason}
        onClose={() => {
          if (deletePending) return;
          setDeleteConfirmOpen(false);
          setDeleteError("");
        }}
        onConfirm={() => void handleConfirmDelete()}
        onDetailChange={(value) => {
          setDeleteReasonDetail(value);
          setDeleteError("");
        }}
        onReasonChange={(value) => {
          setDeleteReason(value);
          setDeleteError("");
        }}
      />

      <CareerEmailChangeModal
        currentEmail={savedProfile.email}
        onChanged={(profile) => {
          const nextSaved = {
            email: normalizeAccountFieldEmail(
              profile.email ?? savedProfile.email
            ),
            name: normalizeAccountFieldName(profile.name ?? savedProfile.name),
            userId: profile.user_id || savedProfile.userId,
          };
          setSavedProfile(nextSaved);
          onProfileSaved({
            email: nextSaved.email,
            name: nextSaved.name,
            user_id: nextSaved.userId,
          });
        }}
        onClose={() => setEmailChangeModalOpen(false)}
        open={emailChangeModalOpen}
        returnPath="/career/profile?panel=settings&settingsTab=account"
      />
    </>
  );
};

type MobileSettingsMenuLink = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
};

const mobileMenuRowClassName =
  "gap-3 transition-opacity active:opacity-60";
const mobileMenuIconClassName = "size-[18px] shrink-0 text-neutral-muted";

const MobileSettingsMenuRow = ({ link }: { link: MobileSettingsMenuLink }) => (
  <GroupedListRow asChild className={mobileMenuRowClassName}>
    <button type="button" onClick={link.onSelect}>
      <link.Icon aria-hidden="true" className={mobileMenuIconClassName} />
      <span className="min-w-0 flex-1">{link.label}</span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-neutral-soft"
      />
    </button>
  </GroupedListRow>
);

const MobileSettingsExternalRow = ({
  href,
  icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) => (
  <GroupedListRow asChild className={mobileMenuRowClassName}>
    <a href={href} target="_blank" rel="noreferrer" onClick={onClick}>
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      <ExternalLink
        aria-hidden="true"
        className="size-3.5 shrink-0 text-neutral-soft"
      />
    </a>
  </GroupedListRow>
);

const MobileSettingsMenu = ({
  account,
  profileImageUrl,
  onLogout,
  onNavigate,
  onSelectTab,
}: {
  account: { email: string; name: string };
  profileImageUrl: string | null;
  onLogout: () => void | Promise<void>;
  onNavigate?: (tab: CareerWorkspaceTab) => void;
  onSelectTab: (tab: CareerSettingsTab) => void;
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const profileInitial =
    account.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((value) => value[0]?.toUpperCase())
      .join("") || "C";

  const pageLinks: MobileSettingsMenuLink[] = onNavigate
    ? (
        [
          {
            tab: "profile",
            Icon: User,
            label: t("career.workspace.my_information", "내 정보"),
          },
          {
            tab: "documents",
            Icon: FileText,
            label: t("career.sky.documents", "자료"),
          },
          {
            tab: "brief",
            Icon: TextSelect,
            label: t(
              "career.profile.career_profile_workspace.search_brief_tab",
              "원하는 조건"
            ),
          },
          {
            tab: "watchlist",
            Icon: Building2,
            label: t("career.sky.companies", "관심 회사"),
          },
        ] as const
      ).map(({ tab, Icon, label }) => ({
        key: tab,
        Icon,
        label,
        onSelect: () => {
          logCareerEvent(`click_settings_menu_${tab}`);
          onNavigate(tab);
        },
      }))
    : [];
  // Schedules sit just above the companies link.
  pageLinks.splice(Math.max(pageLinks.length - 1, 0), 0, {
    key: "schedules",
    Icon: CalendarClock,
    label: t("career.automation.schedules", "예약된 작업"),
    onSelect: () => onSelectTab("automation"),
  });

  const supportLinks: MobileSettingsMenuLink[] = [
    {
      key: "support",
      Icon: HelpCircle,
      label: t("career.profile.career_profile_menu.1vjbdm5", "문의하기"),
      onSelect: () => {
        logCareerEvent("click_profile_menu_support");
        setInquiryOpen(true);
      },
    },
    {
      key: "chat",
      Icon: MessageCircle,
      label: "Chat with us",
      onSelect: () => {
        logCareerEvent("click_profile_menu_about_talk_to_founder");
        openCustomCrispWidget();
      },
    },
  ];

  return (
    <>
      <nav className="space-y-4 pb-6">
        <GroupedList>
          <GroupedListRow asChild className={mobileMenuRowClassName}>
            <button type="button" onClick={() => onSelectTab("account")}>
              <span className="inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-inverse text-sm text-neutral-00">
                {profileImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profileInitial
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {account.name}
                </span>
                <span className="block truncate text-[13px] text-neutral-600">
                  {account.email}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-neutral-soft"
              />
            </button>
          </GroupedListRow>
        </GroupedList>

        {pageLinks.length > 0 && (
          <GroupedList>
            {pageLinks.map((link) => (
              <MobileSettingsMenuRow key={link.key} link={link} />
            ))}
          </GroupedList>
        )}

        <GroupedList>
          <MobileSettingsMenuRow
            link={{
              key: "opportunity-settings",
              Icon: SlidersHorizontal,
              label: t("career.settings.career_settings_modal.0tdjt8e", "기회 설정"),
              onSelect: () => onSelectTab("profile"),
            }}
          />
        </GroupedList>

        <GroupedList>
          {supportLinks.map((link) => (
            <MobileSettingsMenuRow key={link.key} link={link} />
          ))}
        </GroupedList>

        <GroupedList>
          <MobileSettingsExternalRow
            href="/update-notes"
            icon={
              <ScrollText aria-hidden="true" className={mobileMenuIconClassName} />
            }
            label={t("career.common.career.14ybad0", "업데이트 노트")}
            onClick={() => logCareerEvent("click_profile_menu_update_notes")}
          />
          <MobileSettingsExternalRow
            href="https://www.linkedin.com/company/matchharper/"
            icon={
              <Image
                src="/images/logos/linkedin.svg"
                alt=""
                width={18}
                height={18}
                className="size-[18px] shrink-0"
              />
            }
            label="Linkedin"
            onClick={() =>
              logCareerEvent("click_profile_menu_about_linkedin")
            }
          />
          <MobileSettingsExternalRow
            href="https://matchharper.com/about"
            icon={
              <Landmark aria-hidden="true" className={mobileMenuIconClassName} />
            }
            label="About us"
            onClick={() =>
              logCareerEvent("click_profile_menu_about_about_us")
            }
          />
        </GroupedList>

        <div className="px-5">
          <BareButton
            type="button"
            onClick={() => {
              logCareerEvent("click_profile_menu_logout");
              void onLogout();
            }}
            className="min-h-11 text-sm text-critical"
          >
            {t("career.profile.career_profile_menu.1k7ppv0", "로그아웃")}
          </BareButton>
        </div>
      </nav>

      {inquiryOpen && (
        <CareerSupportInquiryModal
          onClose={() => setInquiryOpen(false)}
          defaultEmail={account.email}
        />
      )}
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
  if (tab === "automation")
    return (
      <CareerAutomationSettingsSection section="schedules" hideScheduleHeading />
    );
  if (tab === "profile") return <CareerOpportunitySettingsSection />;
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

const useCareerSettingsAccount = () => {
  const t = useCareerT();
  const { onLogout } = useCareerSidebarContext();
  const { onUpdateAccountProfile, talentProfile, user } =
    useCareerProfileContext();
  const account = {
    email:
      user?.email ??
      talentProfile.talentUser?.email ??
      t("career.settings.career_settings_modal.0zjg8a0", "로그인 중"),
    name:
      talentProfile.talentUser?.name ??
      user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      (typeof user?.email === "string" ? user.email.split("@")[0] : ""),
    userId: talentProfile.talentUser?.user_id ?? user?.id ?? "",
  };
  const profileImageUrl = getCareerMenuProfileImageUrl({
    authenticatedUserImageUrl: getAuthenticatedUserProfileImageUrl(user),
    talentProfileImageUrl: talentProfile.talentUser?.profile_picture,
  });
  return { account, onLogout, onUpdateAccountProfile, profileImageUrl, user };
};

/**
 * Mobile profile page (`/career/me`): the whole settings menu, with account and
 * opportunity settings opened in place. `section` comes from the URL so the
 * browser back button returns to the menu.
 */
export const CareerMePanel = ({
  section,
  onNavigate,
  onSelectSection,
}: {
  section: CareerSettingsTab | null;
  onNavigate: (tab: CareerWorkspaceTab) => void;
  onSelectSection: (section: CareerSettingsTab | null) => void;
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const { account, onLogout, onUpdateAccountProfile, profileImageUrl } =
    useCareerSettingsAccount();
  const settingsTabs = getSettingsTabs(t);
  const title =
    section === "automation"
      ? t("career.automation.schedules", "예약된 작업")
      : section
        ? settingsTabs.find((tab) => tab.key === section)?.label
        : t("career.common.career.1338q8i", "설정");

  return (
    <div className="relative">
      <header className="career-panel-heading">
        <h1>{title}</h1>
        <MuteButton
          variant="transparent"
          aria-label={t("career.settings.career_settings_modal.0poe6eq", "뒤로")}
          onClick={() => {
            if (section) {
              logCareerEvent("click_settings_back_to_menu");
              onSelectSection(null);
            } else {
              onNavigate("home");
            }
          }}
        >
          <ArrowLeft className="size-4" />
        </MuteButton>
      </header>
      {section ? (
        <div className="relative">
          {renderSection(section, account, onLogout, onUpdateAccountProfile)}
        </div>
      ) : (
        <MobileSettingsMenu
          account={account}
          profileImageUrl={profileImageUrl}
          onLogout={onLogout}
          onNavigate={onNavigate}
          onSelectTab={(tab) => {
            logCareerEvent(`click_settings_tab_${tab}`);
            onSelectSection(tab);
          }}
        />
      )}
    </div>
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
  const { account, onLogout, onUpdateAccountProfile, user } =
    useCareerSettingsAccount();
  const settingsTabs = getSettingsTabs(t);
  const [activeTab, setActiveTab] = useState<CareerSettingsTab>("profile");

  const handleClose = useCallback(() => {
    logCareerEvent("click_settings_close");
    onClose();
    setActiveTab("profile");
  }, [logCareerEvent, onClose]);

  useEffect(() => {
    if (!open || user) return;
    onClose();
  }, [onClose, open, user]);

  useEffect(() => {
    if (!open || !initialTab) return;
    const timer = window.setTimeout(() => setActiveTab(initialTab), 0);
    return () => window.clearTimeout(timer);
  }, [initialTab, open]);

  const renderTabPanel = (tab: CareerSettingsTab) => {
    const title =
      settingsTabs.find((settingsTab) => settingsTab.key === tab)?.label ?? "";

    return (
      <SettingsTabPanel title={title}>
        {renderSection(tab, account, onLogout, onUpdateAccountProfile)}
      </SettingsTabPanel>
    );
  };

  if (!open) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={handleClose}
      ariaLabel={"커리어 설정"}
      overlayClassName="items-start pt-14"
      panelClassName="max-w-none h-[80svh] max-h-[860px] px-0 w-[min(1040px,90vw)]"
      bodyClassName="h-full rounded-[inherit] p-0"
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
                      "flex w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-interaction-selected text-neutral-primary shadow-(--shadow-tab-selected)"
                        : "text-neutral-primary hover:bg-bg-weak",
                    ].join(" ")}
                  >
                    <tab.Icon className="h-4 w-4" />
                    <span className="min-w-0 flex-1">{tab.label}</span>

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

export default React.memo(CareerSettingsModal);
