import {
  Building2,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import React, { KeyboardEvent, useMemo, useState } from "react";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import type { CareerProfileVisibility } from "@/hooks/career/useCareerTalentSettings";

const PROFILE_VISIBILITY_OPTIONS: Array<{
  value: CareerProfileVisibility;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: "open_to_matches",
    label: "Open to matches",
    description:
      "Your profile can be shared with companies for roles that look like a strong match.",
    Icon: ShieldCheck,
  },
  {
    value: "exceptional_only",
    label: "Exceptional only",
    description:
      "You will only be shared with roles that Jack deems to be an exceptional match.",
    Icon: ShieldAlert,
  },
  {
    value: "dont_share",
    label: "Don't share",
    description: "Your profile will not be shared with companies.",
    Icon: Lock,
  },
];

const CareerVisibilitySettingsSection = () => {
  const {
    settingsLoading,
    settingsSaving,
    settingsError,
    profileVisibility,
    blockedCompanies,
    onProfileVisibilityChange,
    onAddBlockedCompany,
    onRemoveBlockedCompany,
  } = useCareerSidebarContext();

  const [blockedCompanyDraft, setBlockedCompanyDraft] = useState("");

  const selectedVisibilityOption = useMemo(
    () =>
      PROFILE_VISIBILITY_OPTIONS.find(
        (option) => option.value === profileVisibility
      ) ?? PROFILE_VISIBILITY_OPTIONS[1],
    [profileVisibility]
  );

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
    <div className="">
      <div className="">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-hblack1000">프로필 공개</h2>
          {settingsLoading || settingsSaving ? (
            <span className="inline-flex items-center gap-1 text-xs text-hblack500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {settingsLoading ? "불러오는 중" : "저장 중"}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-hblack600">
          Control how your profile is shared with companies
        </p>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-hblack200 bg-hblack100/30 p-1">
          {PROFILE_VISIBILITY_OPTIONS.map((option) => {
            const isSelected = option.value === profileVisibility;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onProfileVisibilityChange(option.value)}
                disabled={settingsLoading || settingsSaving}
                className={[
                  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  isSelected
                    ? "bg-xprimary/10 text-xprimary"
                    : "text-hblack700 hover:bg-hblack100",
                ].join(" ")}
              >
                <option.Icon className="h-3.5 w-3.5" />
                <span className="text-center">{option.label}</span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-sm text-hblack600">
          {selectedVisibilityOption.description}
        </p>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold text-hblack1000">차단 기업</h3>
        <p className="mt-1 text-sm text-hblack600">
          입력된 회사에게는 회원님의 정보가 공개되지 않습니다.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <input
            value={blockedCompanyDraft}
            onChange={(event) => setBlockedCompanyDraft(event.target.value)}
            onKeyDown={handleBlockedCompanyKeyDown}
            placeholder="회사명을 입력하고 Enter"
            disabled={settingsLoading || settingsSaving}
            className="h-10 flex-1 rounded-lg border border-hblack300 bg-hblack000 px-3 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            onClick={handleAddBlockedCompany}
            disabled={settingsLoading || settingsSaving}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-hblack300 px-3 text-sm text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            추가
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {blockedCompanies.length === 0 ? (
            <div className="rounded-lg border border-dashed border-hblack200 px-3 py-3 text-sm text-hblack500">
              차단된 회사가 없습니다.
            </div>
          ) : (
            blockedCompanies.map((companyName) => (
              <div
                key={companyName}
                className="flex items-center justify-between rounded-lg border border-hblack200 bg-hblack000 px-3 py-2"
              >
                <div className="inline-flex items-center gap-2 text-sm text-hblack800">
                  <Building2 className="h-4 w-4 text-hblack500" />
                  {companyName}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveBlockedCompany(companyName)}
                  disabled={settingsLoading || settingsSaving}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-hblack300 text-hblack600 transition-colors hover:border-xprimary hover:text-xprimary disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`${companyName} 삭제`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {settingsError ? (
        <p className="rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
          {settingsError}
        </p>
      ) : null}
    </div>
  );
};

export default CareerVisibilitySettingsSection;
