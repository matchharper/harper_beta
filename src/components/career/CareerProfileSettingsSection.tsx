import {
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
import { useCareerSidebarContext } from "./CareerSidebarContext";
import type { CareerProfileVisibility } from "@/hooks/career/useCareerTalentSettings";
import {
  CareerField,
  CareerPrimaryButton,
  CareerSecondaryButton,
  CareerTextInput,
} from "./ui/CareerPrimitives";

const PROFILE_VISIBILITY_OPTIONS: Array<{
  value: CareerProfileVisibility;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  sub?: string;
}> = [
  {
    value: "open_to_matches",
    label: "Open to matches",
    description:
      "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다.",
    Icon: ShieldCheck,
    sub: "강하게 맞는 포지션으로 판단되면 회사에 먼저 프로필을 공유하고, 구체적인 제안을 받으신 뒤 판단하실 수 있도록 합니다.",
  },
  {
    value: "exceptional_only",
    label: "Exceptional only",
    description:
      "매칭된 기회/회사를 확인한 뒤 허용한 경우에만 프로필이 공유됩니다.",
    Icon: ShieldAlert,
    sub: "매칭된 기회/회사를 확인한 뒤 허용한 경우에만 프로필이 회사 측에 공유됩니다. 이 경우에도 대화 내용 및 선택하신 옵션이 공개되진 않고, 매칭에 필요한 정보만 공유됩니다.",
  },
  {
    value: "dont_share",
    label: "Don't share",
    description:
      "절대 어떤 경우에도 프로필이 공유되지 않습니다. 잠시 모든 매칭을 차단하고 싶다면 이 옵션을 선택해주세요.",
    Icon: Lock,
    sub: "모든 매칭이 종료되고, 어떤 경우에도 등록하신 정보가 외부에 전달되지 않습니다. 완전히 모든 기회를 잠시 차단하고 싶으신 경우에만 이 옵션을 선택해주세요.",
  },
];

const formatUpdatedAt = (value: string | null) => {
  if (!value) return "아직 저장된 변경 이력이 없습니다.";

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const CareerProfileSharingSettingsSection = ({
  showLastUpdated = true,
}: {
  showLastUpdated?: boolean;
}) => {
  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    settingsSaveInfo,
    settingsUpdatedAt,
    profileVisibility,
    blockedCompanies,
    hasUnsavedTalentSettingsChanges,
    onProfileVisibilityChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
    onSaveTalentSettings,
    onResetTalentSettings,
  } = useCareerSidebarContext();
  const [blockedCompanyDraft, setBlockedCompanyDraft] = useState("");

  const isSavePending = settingsSaving;
  const hasUnsavedChanges = hasUnsavedTalentSettingsChanges;
  const canSaveProfileSettings = hasUnsavedChanges && !settingsLoading;
  const saveError = settingsError;
  const saveInfo = settingsSaveInfo;
  const selectedVisibilityOption = useMemo(
    () =>
      PROFILE_VISIBILITY_OPTIONS.find(
        (option) => option.value === profileVisibility
      ) ?? PROFILE_VISIBILITY_OPTIONS[1],
    [profileVisibility]
  );

  const handleSave = async () => {
    if (!hasUnsavedTalentSettingsChanges) return;
    await onSaveTalentSettings();
  };

  const handleRefresh = () => {
    onResetTalentSettings();
    setBlockedCompanyDraft("");
  };

  const handleAddBlockedCompany = () => {
    const nextCompany = blockedCompanyDraft.trim();
    if (!nextCompany) return;
    onAddBlockedCompany(nextCompany);
    setBlockedCompanyDraft("");
  };

  const handleBlockedCompanyKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleAddBlockedCompany();
  };

  return (
    <div className="font-geist">
      {showLastUpdated ? (
        <div className="mb-6 text-sm">
          <span className="text-beige900/45">Last updated : </span>
          <span className="text-beige900">
            {formatUpdatedAt(settingsUpdatedAt)}
          </span>
        </div>
      ) : null}

      <div>
        <CareerField
          label="프로필 공개"
          hint="어떤 수준의 매칭에서 회사가 프로필을 볼 수 있는지 정합니다."
        >
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-3">
              {PROFILE_VISIBILITY_OPTIONS.map((option) => {
                const isSelected = option.value === profileVisibility;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onProfileVisibilityChange(option.value)}
                    disabled={settingsLoading || isSavePending}
                    className={[
                      "rounded-[8px] border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      isSelected
                        ? "border-beige900 bg-beige200/80 text-beige900 outline outline-[0.5px] outline-beige900"
                        : "border-beige900/15 bg-white/45 text-beige900/70 hover:border-beige900/40 hover:text-beige900",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <option.Icon className="h-4 w-4" />
                      <span>{option.label}</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-5 text-inherit/80">
                      {option.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-[13px] text-beige900/60">
              {settingsLoading && (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>불러오는 중</span>
                </>
              )}
              {!settingsLoading && (
                <span
                  className={`${selectedVisibilityOption.value === "dont_share" ? "text-red-600" : "text-beige900/60"}`}
                >
                  {selectedVisibilityOption.sub}
                </span>
              )}
            </div>
          </div>
        </CareerField>

        <CareerField
          label="차단 기업"
          icon={<ShieldAlert className="h-4 w-4" />}
          hint="여기에 등록된 회사와는 매칭이 일어나지 않고 프로필도 절대 공유되지 않습니다."
        >
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <CareerTextInput
                value={blockedCompanyDraft}
                onChange={(event) => setBlockedCompanyDraft(event.target.value)}
                onKeyDown={handleBlockedCompanyKeyDown}
                placeholder="회사명을 입력하고 Enter"
                disabled={settingsLoading || isSavePending}
                className="flex-1"
              />
              <CareerSecondaryButton
                onClick={handleAddBlockedCompany}
                disabled={settingsLoading || isSavePending}
                className="gap-2 px-4"
              >
                <Plus className="h-3.5 w-3.5" />
                추가
              </CareerSecondaryButton>
            </div>

            {blockedCompanies.length === 0 ? (
              <div className="rounded-[8px] border border-dashed border-beige900/15 bg-white/30 px-3 py-2 text-sm text-beige900/45">
                차단된 회사가 없습니다.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {blockedCompanies.map((companyName) => (
                  <div
                    key={companyName}
                    className="inline-flex items-center gap-2 rounded-[8px] border border-beige900/10 bg-white/45 pl-3 pr-1.5 py-1.5 text-sm text-beige900"
                  >
                    <span>{companyName}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveBlockedCompany(companyName)}
                      disabled={settingsLoading || isSavePending}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-beige900/45 transition-colors hover:bg-beige900/10 hover:text-beige900 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`${companyName} 삭제`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CareerField>
      </div>

      {saveError && (
        <div className="mt-5 border border-[#7c2d12]/15 bg-[#7c2d12]/5 px-4 py-3 text-sm text-[#7c2d12]">
          {saveError}
        </div>
      )}

      {saveInfo && (
        <div className="mt-5 border border-beige900/10 bg-white/40 px-4 py-3 text-sm text-beige900/50">
          {saveInfo}
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="fixed bottom-4 right-4 flex justify-end gap-2">
          <CareerSecondaryButton
            onClick={handleRefresh}
            disabled={isSavePending || settingsLoading}
            className="gap-2 px-4 bg-beige50/70"
          >
            <Undo2 className="h-4 w-4" />
            되돌리기
          </CareerSecondaryButton>
          <CareerPrimaryButton
            onClick={() => void handleSave()}
            disabled={isSavePending || !canSaveProfileSettings}
            className="gap-2 px-5"
          >
            {isSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSavePending ? "저장 중..." : "설정 저장"}
          </CareerPrimaryButton>
        </div>
      )}
    </div>
  );
};

const CareerProfileSettingsSection = () => (
  <CareerProfileSharingSettingsSection />
);

export default CareerProfileSettingsSection;
