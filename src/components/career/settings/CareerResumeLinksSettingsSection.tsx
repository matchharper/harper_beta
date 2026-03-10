import { ExternalLink, Plus, Save, Upload, X } from "lucide-react";
import React, { useMemo } from "react";
import { CAREER_LINK_LABELS } from "@/components/career/constants";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";

const CareerResumeLinksSettingsSection = () => {
  const {
    resumeFile,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileLinks,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    onResumeFileChange,
    onProfileLinkChange,
    onAddProfileLink,
    onRemoveProfileLink,
    onSaveTalentProfile,
  } = useCareerSidebarContext();

  const hasSavedResume = useMemo(
    () => Boolean(savedResumeFileName || savedResumeStoragePath),
    [savedResumeFileName, savedResumeStoragePath]
  );

  return (
    <div className="space-y-4">
      <div className="">
        <h2 className="text-lg font-semibold text-hblack1000">
          내 이력서/링크
        </h2>
        <p className="mt-1 text-sm text-hblack600">
          지금 내 이력서/링크 저장된 파일과 링크를 확인하고 수정할 수 있습니다.
        </p>
      </div>

      <div className="rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
        <p className="text-xs uppercase tracking-[0.08em] text-hblack500">
          저장된 이력서
        </p>
        {hasSavedResume ? (
          <>
            <p className="mt-2 truncate text-sm text-hblack800">
              {savedResumeFileName ?? "파일명 정보 없음"}
            </p>
            {savedResumeStoragePath ? (
              <p className="mt-1 truncate text-xs text-hblack500">
                {savedResumeStoragePath}
              </p>
            ) : null}
            {savedResumeDownloadUrl ? (
              <a
                href={savedResumeDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-xprimary underline underline-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                다운로드
              </a>
            ) : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-hblack500">
            저장된 이력서가 없습니다.
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="career-settings-resume-upload"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-hblack300 px-3 text-xs font-medium text-hblack700 hover:border-xprimary hover:text-xprimary"
          >
            <Upload className="h-3.5 w-3.5" />새 이력서 선택
          </label>
          <input
            id="career-settings-resume-upload"
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={(event) => {
              onResumeFileChange(event.target.files?.[0] ?? null);
            }}
          />
        </div>
        {resumeFile ? (
          <p className="mt-2 truncate text-xs text-hblack700">
            업로드 예정: {resumeFile.name}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-hblack200 bg-hblack000 px-4 py-4">
        <p className="text-xs uppercase tracking-[0.08em] text-hblack500">
          링크
        </p>
        <div className="mt-2 space-y-2">
          {profileLinks.map((link, index) => (
            <div
              key={`settings-profile-link-${index}`}
              className="flex items-center gap-2"
            >
              <div className="w-24 text-xs text-hblack500">
                {CAREER_LINK_LABELS[index] ?? "추가 링크"}
              </div>
              <input
                value={link}
                onChange={(event) =>
                  onProfileLinkChange(index, event.target.value)
                }
                placeholder="https://"
                className="h-9 flex-1 rounded-lg border border-hblack300 bg-hblack000 px-2 text-sm text-hblack900 outline-none transition-colors focus:border-xprimary"
              />
              {index >= 3 ? (
                <button
                  type="button"
                  onClick={() => onRemoveProfileLink(index)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hblack300 text-hblack600 transition-colors hover:border-xprimary hover:text-xprimary"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onAddProfileLink}
          className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-hblack300 px-3 text-xs text-hblack700 transition-colors hover:border-xprimary hover:text-xprimary"
        >
          <Plus className="h-3.5 w-3.5" />
          링크 추가
        </button>
      </div>

      {profileSaveError ? (
        <p className="rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
          {profileSaveError}
        </p>
      ) : null}
      {profileSaveInfo ? (
        <p className="rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
          {profileSaveInfo}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void onSaveTalentProfile()}
        disabled={profileSavePending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save className="h-4 w-4" />
        {profileSavePending ? "저장 중..." : "이력서/링크 저장"}
      </button>
    </div>
  );
};

export default CareerResumeLinksSettingsSection;
