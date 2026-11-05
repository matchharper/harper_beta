import {
  ChevronRight,
  Loader2,
  Plus,
  Save,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";
import React, { KeyboardEvent, useState } from "react";
import { useCareerProfileContext } from "./CareerSidebarContext";
import {
  ProfileVisibilityPanel,
  getProfileVisibilityLabels,
} from "./ProfileVisibilityPanel";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import type {
  CareerProfileVisibility,
} from "@/hooks/career/useCareerTalentSettings";
import { ActionButton, MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/panel";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

const formatUpdatedAt = (value: string, locale: Locale) => {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const CareerProfileSharingSettingsSection = ({
  disabled = false,
  showBlockedCompanies = true,
  showLastUpdated = true,
  showProfileVisibility = true,
}: {
  disabled?: boolean;
  showBlockedCompanies?: boolean;
  showLastUpdated?: boolean;
  showProfileVisibility?: boolean;
}) => {
  const t = useCareerT();
  const profileVisibilityLabels = getProfileVisibilityLabels(t);

  const { locale } = useMessages();
  const logCareerEvent = useCareerLogEvent();
  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsUpdatedAt,
    profileVisibility,
    blockedCompanies,
    hasUnsavedTalentSettingsChanges,
    onProfileVisibilityChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
    onSaveTalentSettings,
    onResetTalentSettings,
  } = useCareerProfileContext();
  const [blockedCompanyDraft, setBlockedCompanyDraft] = useState("");
  const [profileVisibilitySavePending, setProfileVisibilitySavePending] =
    useState(false);
  const [profileVisibilityPanelOpen, setProfileVisibilityPanelOpen] =
    useState(false);
  const [blockedCompaniesSavePending, setBlockedCompaniesSavePending] =
    useState(false);
  const isSavePending = settingsSaving;
  const hasUnsavedChanges = hasUnsavedTalentSettingsChanges;
  const canSaveProfileSettings = hasUnsavedChanges && !settingsLoading;
  const saveError = settingsError;
  const lastUpdatedLabel = settingsUpdatedAt
    ? formatUpdatedAt(settingsUpdatedAt, locale)
    : t(
        "career.profile.settings.no_saved_changes",
        "아직 저장된 변경 이력이 없습니다."
      );

  const handleSave = async () => {
    if (!hasUnsavedTalentSettingsChanges) return;
    logCareerEvent("click_profile_settings_save");
    await onSaveTalentSettings();
  };

  const handleCloseProfileVisibilityPanel = () => {
    if (profileVisibilitySavePending) return;
    setProfileVisibilityPanelOpen(false);
  };

  const handleProfileVisibilityChange = async (
    value: CareerProfileVisibility
  ) => {
    if (
      disabled ||
      settingsLoading ||
      isSavePending ||
      profileVisibilitySavePending ||
      value === profileVisibility
    )
      return;

    logCareerEvent(`click_profile_visibility_${value}`);
    setProfileVisibilitySavePending(true);
    try {
      await onProfileVisibilityChange(value);
    } finally {
      setProfileVisibilitySavePending(false);
    }
  };

  const handleRefresh = () => {
    logCareerEvent("click_profile_settings_reset");
    onResetTalentSettings();
    setBlockedCompanyDraft("");
  };

  const handleAddBlockedCompany = async () => {
    const nextCompany = blockedCompanyDraft.trim();
    if (
      !nextCompany ||
      settingsLoading ||
      isSavePending ||
      blockedCompaniesSavePending
    ) {
      return;
    }

    logCareerEvent("click_profile_settings_add_blocked_company");
    setBlockedCompaniesSavePending(true);
    try {
      const saved = await onAddBlockedCompany(nextCompany);
      if (saved) {
        setBlockedCompanyDraft("");
      }
    } finally {
      setBlockedCompaniesSavePending(false);
    }
  };

  const handleRemoveBlockedCompany = async (companyName: string) => {
    if (settingsLoading || isSavePending || blockedCompaniesSavePending) {
      return;
    }

    logCareerEvent("click_profile_settings_remove_blocked_company");
    setBlockedCompaniesSavePending(true);
    try {
      await onRemoveBlockedCompany(companyName);
    } finally {
      setBlockedCompaniesSavePending(false);
    }
  };

  const handleBlockedCompanyKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void handleAddBlockedCompany();
  };

  return (
    <>
      <div>
        {showLastUpdated ? (
          <div className="mb-6 text-sm">
            <span className="text-neutral-soft">Last updated : </span>
            <span className="text-neutral-primary">{lastUpdatedLabel}</span>
          </div>
        ) : null}

        <div className="space-y-8">
          {showProfileVisibility ? (
            // hint={t(
            //   "career.common.career.1bbxwls",
            //   "Harper가 회사에게 먼저 회원님을 소개해도 되는지 결정합니다."
            // )}
            <MuteButton
              variant="default"
              size="lg"
              className="w-full justify-between bg-bg-weak hover:bg-interaction-hover rounded-control shadow-none border-none px-4 text-sm"
              aria-haspopup="dialog"
              aria-expanded={profileVisibilityPanelOpen}
              disabled={
                disabled ||
                settingsLoading ||
                isSavePending ||
                profileVisibilitySavePending
              }
              onClick={() => setProfileVisibilityPanelOpen(true)}
            >
              <span className="inline-flex items-center gap-2">
                <span>
                  {t(
                    "career.profile.career_profile_settings_section.1tnqucg",
                    "프로필 공유 방식"
                  )}{" "}
                  :
                </span>
                <span className="text-action-strong">
                  {profileVisibilityLabels[profileVisibility]}
                </span>
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </MuteButton>
          ) : null}

          {showBlockedCompanies ? (
            <Field
              label={
                <span className="inline-flex items-center gap-2">
                  <span>
                    {t(
                      "career.profile.career_profile_settings_section.0o48hts",
                      "제외할 회사"
                    )}
                  </span>
                  {blockedCompaniesSavePending ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-neutral-muted"
                      aria-label={"차단 기업 저장 중"}
                    />
                  ) : null}
                </span>
              }
              icon={<ShieldAlert className="h-4 w-4" />}
              hint={t(
                "career.common.career.1v4kit0",
                "여기에 등록된 회사와는 매칭이 일어나지 않고 프로필도 절대 공유되지 않습니다."
              )}
            >
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={blockedCompanyDraft}
                    onChange={(event) =>
                      setBlockedCompanyDraft(event.target.value)
                    }
                    onKeyDown={handleBlockedCompanyKeyDown}
                    placeholder={t(
                      "career.profile.career_profile_settings_section.10tme3s",
                      "회사명을 입력하고 Enter"
                    )}
                    disabled={
                      settingsLoading ||
                      isSavePending ||
                      blockedCompaniesSavePending
                    }
                    className="flex-1"
                  />
                  <MuteButton
                    onClick={() => void handleAddBlockedCompany()}
                    disabled={
                      settingsLoading ||
                      isSavePending ||
                      blockedCompaniesSavePending
                    }
                  >
                    {blockedCompaniesSavePending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    {blockedCompaniesSavePending
                      ? t(
                          "career.profile.career_profile_settings_section.08zy6at",
                          "저장 중..."
                        )
                      : t(
                          "career.profile.career_profile_settings_section.07836ex",
                          "추가"
                        )}
                  </MuteButton>
                </div>

                {blockedCompanies.length === 0 ? (
                  <div className=""></div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {blockedCompanies.map((companyName) => (
                      <div
                        key={companyName}
                        className="inline-flex items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-floating py-1.5 pl-3 pr-1.5 text-sm text-neutral-primary shadow-(--shadow-xs)"
                      >
                        <span>{companyName}</span>
                        <ActionButton
                          onClick={() =>
                            void handleRemoveBlockedCompany(companyName)
                          }
                          disabled={
                            settingsLoading ||
                            isSavePending ||
                            blockedCompaniesSavePending
                          }
                          actionVariant="icon"
                          buttonRadius="rounded"
                          className="h-6 w-6 border-transparent bg-transparent text-neutral-soft hover:bg-bg-weak"
                          aria-label={`${companyName} 삭제`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </ActionButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          ) : null}
        </div>

        {saveError && (
          <div className="mt-5 border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
            {saveError}
          </div>
        )}

        {hasUnsavedChanges &&
          !profileVisibilitySavePending &&
          !isSavePending &&
          !blockedCompaniesSavePending && (
            <div className="fixed bottom-4 right-4 flex justify-end gap-2">
              <ActionButton
                onClick={handleRefresh}
                disabled={isSavePending || settingsLoading}
                actionVariant="secondary"
                className="bg-bg-floating/90"
              >
                <Undo2 className="h-4 w-4" />
                {t(
                  "career.profile.career_profile_settings_section.0on2o51",
                  "되돌리기"
                )}
              </ActionButton>
              <ActionButton
                onClick={() => void handleSave()}
                disabled={isSavePending || !canSaveProfileSettings}
                actionVariant="primary"
              >
                {isSavePending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {isSavePending
                  ? t(
                      "career.profile.career_profile_settings_section.08zy6at",
                      "저장 중..."
                    )
                  : t(
                      "career.profile.career_profile_settings_section.18i3x5x",
                      "설정 저장"
                    )}
              </ActionButton>
            </div>
          )}
      </div>

      <ProfileVisibilityPanel
        value={profileVisibilityPanelOpen ? profileVisibility : null}
        saving={profileVisibilitySavePending || isSavePending}
        error={settingsError}
        onValueChange={(value) => void handleProfileVisibilityChange(value)}
        onClose={handleCloseProfileVisibilityPanel}
      />
    </>
  );
};

const CareerProfileSettingsSection = () => (
  <CareerProfileSharingSettingsSection
    showBlockedCompanies={false}
    showLastUpdated={false}
  />
);

export const CareerPreferencesSettingsSection = () => (
  <CareerProfileSharingSettingsSection
    showLastUpdated={false}
    showProfileVisibility={false}
  />
);

export default CareerProfileSettingsSection;
