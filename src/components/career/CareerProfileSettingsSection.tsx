import {
  BriefcaseBusiness,
  Clock3,
  Handshake,
  Loader2,
  Lock,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  X,
} from "lucide-react";
import React, { KeyboardEvent, useMemo, useState } from "react";
import { useCareerProfileContext } from "./CareerSidebarContext";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import type {
  CareerEngagementType,
  CareerProfileVisibility,
} from "@/hooks/career/useCareerTalentSettings";
import {
  ActionButton,
  ChoiceCard,
  MuteButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/panel";
import { Tooltips } from "@/components/ui/tooltip";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

type ProfileVisibilityOption = {
  value: CareerProfileVisibility;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
};

type EngagementTypeOption = {
  value: CareerEngagementType;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const getProfileVisibilityOptions = (
  t: ReturnType<typeof useCareerT>
): ProfileVisibilityOption[] => [
  {
    value: "open_to_matches",
    label: "Open to matches",
    description: t(
      "career.profile.career_profile_settings_section.13fr2yp",
      "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다."
    ),
    Icon: ShieldCheck,
  },
  {
    value: "exceptional_only",
    label: "Exceptional only",
    description: t(
      "career.profile.career_profile_settings_section.0vrogtc",
      "먼저 매칭된 기회/회사를 확인한 뒤 직접 허용한 경우에만 익명 프로필이 공유됩니다."
    ),
    Icon: ShieldAlert,
  },
  {
    value: "dont_share",
    label: "Don't share",
    description: t(
      "career.profile.career_profile_settings_section.1easkuh",
      "절대 어떤 경우에도 프로필이 공유되지 않습니다. 잠시 모든 매칭을 차단하고 싶다면 이 옵션을 선택해주세요."
    ),
    Icon: Lock,
  },
];

const getEngagementTypeOptions = (
  t: ReturnType<typeof useCareerT>
): EngagementTypeOption[] => [
  {
    value: "full_time",
    label: "Full-time Role",
    description: t(
      "career.profile.career_profile_settings_section.engagement_full_time",
      "정규직/풀타임 역할까지 열려 있어요."
    ),
    Icon: BriefcaseBusiness,
  },
  {
    value: "fractional",
    label: "Fractional / Part-time",
    description: t(
      "career.profile.career_profile_settings_section.engagement_fractional",
      "현업을 유지하면서 파트타임·프로젝트 형태로 참여할 수 있어요."
    ),
    Icon: Clock3,
  },
  {
    value: "advisor",
    label: "Technical Advisor",
    description: t(
      "career.profile.career_profile_settings_section.engagement_advisor",
      "전략적·기술적 자문 역할도 검토할 수 있어요."
    ),
    Icon: Handshake,
  },
];

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
  showEngagementTypes = true,
  showLastUpdated = true,
}: {
  showEngagementTypes?: boolean;
  showLastUpdated?: boolean;
}) => {
  const t = useCareerT();

  const { locale } = useMessages();
  const logCareerEvent = useCareerLogEvent();
  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsUpdatedAt,
    profileVisibility,
    engagementTypes,
    blockedCompanies,
    hasUnsavedTalentSettingsChanges,
    onProfileVisibilityChange,
    onEngagementTypesChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
    onSaveTalentSettings,
    onResetTalentSettings,
  } = useCareerProfileContext();
  const [blockedCompanyDraft, setBlockedCompanyDraft] = useState("");
  const [profileVisibilitySavePending, setProfileVisibilitySavePending] =
    useState(false);
  const [engagementTypesSavePending, setEngagementTypesSavePending] =
    useState(false);
  const [pendingProfileVisibility, setPendingProfileVisibility] =
    useState<CareerProfileVisibility | null>(null);
  const [blockedCompaniesSavePending, setBlockedCompaniesSavePending] =
    useState(false);

  const isSavePending = settingsSaving;
  const hasUnsavedChanges = hasUnsavedTalentSettingsChanges;
  const canSaveProfileSettings = hasUnsavedChanges && !settingsLoading;
  const saveError = settingsError;
  const profileVisibilityOptions = useMemo(
    () => getProfileVisibilityOptions(t),
    [t]
  );
  const engagementTypeOptions = useMemo(() => getEngagementTypeOptions(t), [t]);
  const selectedEngagementTypes = useMemo(
    () => new Set<CareerEngagementType>(engagementTypes),
    [engagementTypes]
  );
  const pendingVisibilityOption = useMemo(
    () =>
      profileVisibilityOptions.find(
        (option) => option.value === pendingProfileVisibility
      ) ?? null,
    [pendingProfileVisibility, profileVisibilityOptions]
  );
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

  const handleProfileVisibilitySelect = (value: CareerProfileVisibility) => {
    if (
      value === profileVisibility ||
      settingsLoading ||
      isSavePending ||
      profileVisibilitySavePending
    ) {
      return;
    }

    logCareerEvent(`click_profile_visibility_${value}`);
    setPendingProfileVisibility(value);
  };

  const handleCloseProfileVisibilityConfirm = () => {
    if (profileVisibilitySavePending) return;
    setPendingProfileVisibility(null);
  };

  const handleConfirmProfileVisibilityChange = async () => {
    if (!pendingProfileVisibility || profileVisibilitySavePending) return;

    setProfileVisibilitySavePending(true);
    try {
      const saved = await onProfileVisibilityChange(pendingProfileVisibility);
      if (saved) {
        setPendingProfileVisibility(null);
      }
    } finally {
      setProfileVisibilitySavePending(false);
    }
  };

  const handleEngagementTypeToggle = async (value: CareerEngagementType) => {
    if (settingsLoading || isSavePending || engagementTypesSavePending) {
      return;
    }

    const nextSelected = new Set(selectedEngagementTypes);
    if (nextSelected.has(value)) {
      nextSelected.delete(value);
    } else {
      nextSelected.add(value);
    }
    const nextEngagementTypes = engagementTypeOptions
      .map((option) => option.value)
      .filter((optionValue) => nextSelected.has(optionValue));

    logCareerEvent(`click_profile_settings_engagement_type_${value}`);
    setEngagementTypesSavePending(true);
    try {
      await onEngagementTypesChange(nextEngagementTypes);
    } finally {
      setEngagementTypesSavePending(false);
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

        <div>
          <Field
            label={
              <span className="inline-flex items-center gap-2">
                <span>
                  {t(
                    "career.profile.career_profile_settings_section.1tnqucg",
                    "프로필 공개"
                  )}
                </span>
                {profileVisibilitySavePending ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-neutral-muted"
                    aria-label={"프로필 공개 저장 중"}
                  />
                ) : null}
              </span>
            }
            hint={t(
              "career.common.career.1bbxwls",
              "어떤 수준의 매칭에서 회사가 프로필을 볼 수 있는지 정합니다."
            )}
          >
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                {profileVisibilityOptions.map((option) => {
                  const isSelected = option.value === profileVisibility;

                  return (
                    <Tooltips
                      key={option.value}
                      text={option.description}
                      side="bottom"
                    >
                      <ChoiceCard
                        onClick={() =>
                          handleProfileVisibilitySelect(option.value)
                        }
                        disabled={
                          settingsLoading ||
                          isSavePending ||
                          profileVisibilitySavePending
                        }
                        selected={isSelected}
                        className="h-11 justify-center whitespace-nowrap px-3 text-center text-sm font-medium"
                      >
                        <option.Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </ChoiceCard>
                    </Tooltips>
                  );
                })}
              </div>

              {settingsLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-neutral-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>
                    {t(
                      "career.profile.career_profile_settings_section.1qqh6ja",
                      "불러오는 중"
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </Field>

          {showEngagementTypes ? (
            <Field
              label={
                <span className="inline-flex items-center gap-2">
                  <span>
                    {t(
                      "career.profile.career_profile_settings_section.engagement_types_label",
                      "관심 기회 형태"
                    )}
                  </span>
                  {engagementTypesSavePending ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-neutral-muted"
                      aria-label={"관심 기회 형태 저장 중"}
                    />
                  ) : null}
                </span>
              }
              hint={t(
                "career.profile.career_profile_settings_section.engagement_types_hint",
                "지금 열려있는 기회를 모두 선택해주세요."
              )}
            >
              <div className="grid gap-2 md:grid-cols-3">
                {engagementTypeOptions.map((option) => {
                  const isSelected = selectedEngagementTypes.has(option.value);

                  return (
                    <Tooltips
                      key={option.value}
                      text={option.description}
                      side="bottom"
                    >
                      <ChoiceCard
                        onClick={() =>
                          void handleEngagementTypeToggle(option.value)
                        }
                        disabled={
                          settingsLoading ||
                          isSavePending ||
                          engagementTypesSavePending
                        }
                        selected={isSelected}
                        aria-pressed={isSelected}
                        className="h-11 justify-center whitespace-nowrap px-3 text-center text-sm font-medium"
                      >
                        <option.Icon className="h-4 w-4" />
                        <span>{option.label}</span>
                      </ChoiceCard>
                    </Tooltips>
                  );
                })}
              </div>
            </Field>
          ) : null}

          <Field
            label={
              <span className="inline-flex items-center gap-2">
                <span>
                  {t(
                    "career.profile.career_profile_settings_section.0o48hts",
                    "차단 기업"
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
                      className="inline-flex items-center gap-2 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating py-1.5 pl-3 pr-1.5 text-sm text-neutral-primary shadow-xs"
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
        </div>

        {saveError && (
          <div className="mt-5 border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
            {saveError}
          </div>
        )}

        {hasUnsavedChanges &&
          !profileVisibilitySavePending &&
          !engagementTypesSavePending &&
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

      <TalentCareerModal
        open={Boolean(pendingVisibilityOption)}
        onClose={handleCloseProfileVisibilityConfirm}
        title={t(
          "career.profile.career_profile_settings_section.09ffo10",
          "프로필 공개 설정을 바꿀까요?"
        )}
        description={t(
          "career.profile.career_profile_settings_section.1fz4zad",
          "이 설정에 따라 나의 프로필이 전달되는 조건이 달라집니다."
        )}
        closeOnBackdrop={!profileVisibilitySavePending}
        showCloseButton={!profileVisibilitySavePending}
        panelClassName="max-w-[520px] border border-neutral-1000-a05 bg-bg-floating"
        bodyClassName="bg-bg-floating px-5 py-5"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <SecondaryButton
              onClick={handleCloseProfileVisibilityConfirm}
              disabled={profileVisibilitySavePending}
            >
              {t(
                "career.profile.career_profile_settings_section.0jiry9t",
                "취소"
              )}
            </SecondaryButton>
            <PrimaryButton
              onClick={() => void handleConfirmProfileVisibilityChange()}
              disabled={profileVisibilitySavePending}
            >
              {profileVisibilitySavePending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {profileVisibilitySavePending
                ? t(
                    "career.profile.career_profile_settings_section.08zy6at_2",
                    "저장 중..."
                  )
                : t(
                    "career.profile.career_profile_settings_section.1mx38an",
                    "확인하고 저장"
                  )}
            </PrimaryButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="text-[12px] font-medium text-neutral-muted">
            {t(
              "career.profile.career_profile_settings_section.1z04ms5",
              "변경하려는 공개 범위"
            )}
          </div>
          <div className="mt-2 flex items-start gap-3">
            {pendingVisibilityOption ? (
              <pendingVisibilityOption.Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-primary" />
            ) : null}
            <div className="text-sm font-semibold text-neutral-primary">
              {pendingVisibilityOption?.label}
            </div>
          </div>

          <p
            className="text-sm leading-6 text-neutral-muted"
            dangerouslySetInnerHTML={{
              __html:
                pendingProfileVisibility === "open_to_matches"
                  ? t(
                      "career.profile.career_profile_settings_section.140kczj",
                      "Open to matches로 바꾸면 양측이 선호할 기회라고 판단될 때 Harper가 회사에 먼저 회원님을 제안할 수 있습니다. 이 경우 회사가 먼저 제안을 해오기 때문에 구체적인 제안을 받은 뒤 수락할지말지 결정하실 수 있고, 수락시 100% 연결됩니다.<br /><br />모든 정보가 공개되지 않고 회사 측에서 판단에 필요한 정보만 Harper가 제한적으로 공유합니다.<br />모든 회사가 공유되지 않고 Harper가 회원님이 선호하실 것 같은 기회라고 판단한 경우에만 공유합니다. 직접 등록한 차단 회사에는 절대로 공유되지 않습니다."
                    )
                  : pendingProfileVisibility === "dont_share"
                    ? t(
                        "career.profile.career_profile_settings_section.117d7sb",
                        "Don't share로 바꾸면 모든 추천 및 연결이 중지됩니다. 이미 연결된 기회에 대해서도 회사가 프로필을 볼 수 없게 차단합니다. 서비스를 잠시 중단하고 싶다면 이 옵션을 선택해주세요."
                      )
                    : t(
                        "career.profile.career_profile_settings_section.1izc5gu",
                        "Exceptional only로 바꾸면 먼저 기회나 회사를 확인하고 내가 허용한 경우에만 프로필이 공유됩니다. 절대로 내가 확인하지 않은 회사/역할에 대해 내 정보가 공유되지 않습니다."
                      ),
            }}
          ></p>
        </div>
      </TalentCareerModal>
    </>
  );
};

const CareerProfileSettingsSection = () => (
  <CareerProfileSharingSettingsSection />
);

export default CareerProfileSettingsSection;
