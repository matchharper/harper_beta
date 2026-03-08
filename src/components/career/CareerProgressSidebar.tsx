import {
  ExternalLink,
  LogOut,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { CAREER_LINK_LABELS } from "./constants";
import { useCareerSidebarContext } from "./CareerSidebarContext";

type SidebarTab = "progress" | "profile";

const CareerProgressSidebar = () => {
  const {
    user,
    stage,
    answeredCount,
    targetQuestions,
    progressPercent,
    onLogout,
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

  const [activeTab, setActiveTab] = useState<SidebarTab>("progress");
  const barCount = 10;

  const hasSavedResume = useMemo(
    () => Boolean(savedResumeFileName || savedResumeStoragePath),
    [savedResumeFileName, savedResumeStoragePath]
  );
  const normalizedProgress = useMemo(
    () => Math.max(0, Math.min(100, progressPercent)),
    [progressPercent]
  );
  const barFillLevels = useMemo(() => {
    const progressedBars = (normalizedProgress / 100) * barCount;
    return Array.from({ length: barCount }, (_, index) =>
      Math.max(0, Math.min(1, progressedBars - index))
    );
  }, [barCount, normalizedProgress]);
  const stageLabel = useMemo(() => {
    if (!user) return "로그인 대기";
    if (stage === "profile") return "기본 정보 수집 중";
    if (stage === "completed") return "매칭 준비 완료";
    return "대화 진행 중";
  }, [stage, user]);

  return (
    <aside className="lg:col-span-3 lg:sticky lg:top-8 lg:self-start">
      <div className="rounded-2xl border border-hblack200 bg-hblack000 p-4">
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-hblack200 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("progress")}
              className={[
                "h-8 rounded-md px-3 text-xs transition-colors",
                activeTab === "progress"
                  ? "border border-xprimary/30 bg-xprimary/10 text-xprimary"
                  : "text-hblack600 hover:bg-hblack100",
              ].join(" ")}
            >
              진행 현황
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("profile")}
              className={[
                "h-8 rounded-md px-3 text-xs transition-colors",
                activeTab === "profile"
                  ? "border border-xprimary/30 bg-xprimary/10 text-xprimary"
                  : "text-hblack600 hover:bg-hblack100",
              ].join(" ")}
            >
              내 이력서/링크
            </button>
          </div>
          {user ? (
            <button
              type="button"
              onClick={() => void onLogout()}
              className="inline-flex items-center gap-1 rounded-lg border border-hblack300 px-2 py-1 text-xs text-hblack600 transition-colors hover:bg-hblack100 hover:text-hblack900"
            >
              <LogOut className="h-3.5 w-3.5" />
              로그아웃
            </button>
          ) : null}
        </div>
      </div>

      {activeTab === "progress" ? (
        <>
          <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-6">
            <h2 className="text-lg font-medium text-hblack1000">
              온보딩 진행률
            </h2>
            <p className="mt-2 text-xs text-hblack500">
              회색 막대가 진행될수록 xprimary로 채워집니다.
            </p>

            <div className="mt-5 rounded-xl border border-hblack200 bg-hblack000 px-4 py-5">
              <div className="flex h-44 items-end gap-2">
                {barFillLevels.map((fillLevel, index) => (
                  <div
                    key={`progress-bar-${index}`}
                    className="relative h-full flex-1 overflow-hidden rounded-md border border-hblack200 bg-hblack100"
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 bg-xprimary transition-[height] duration-400 ease-out"
                      style={{ height: `${fillLevel * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-hblack500">
                <span>0%</span>
                <span>{normalizedProgress}%</span>
                <span>100%</span>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-hblack200 bg-hblack000 px-4 py-3">
              <p className="text-sm text-hblack700">
                질문 응답 {answeredCount}/{targetQuestions}
              </p>
              <p className="mt-1 text-xs text-hblack500">현재 상태: {stageLabel}</p>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-6">
          <h2 className="text-lg font-medium text-hblack1000">
            내 이력서/링크
          </h2>
          <p className="mt-2 text-xs text-hblack500">
            저장된 파일과 링크를 확인하고 수정할 수 있습니다.
          </p>

          <div className="mt-4 rounded-lg border border-hblack200 bg-hblack000 px-3 py-3">
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
                htmlFor="career-sidebar-resume-upload"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-hblack300 px-3 text-xs font-medium text-hblack700 hover:border-xprimary hover:text-xprimary"
              >
                <Upload className="h-3.5 w-3.5" />새 이력서 선택
              </label>
              <input
                id="career-sidebar-resume-upload"
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

          <div className="mt-4">
            <p className="text-xs uppercase tracking-[0.08em] text-hblack500">
              링크
            </p>
            <div className="mt-2 space-y-2">
              {profileLinks.map((link, index) => (
                <div
                  key={`sidebar-profile-link-${index}`}
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
            <p className="mt-3 rounded-lg border border-xprimary/30 bg-xprimary/10 px-3 py-2 text-sm text-xprimary">
              {profileSaveError}
            </p>
          ) : null}
          {profileSaveInfo ? (
            <p className="mt-3 rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
              {profileSaveInfo}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void onSaveTalentProfile()}
            disabled={profileSavePending}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-xprimary bg-xprimary text-sm font-medium text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {profileSavePending ? "저장 중..." : "이력서/링크 저장"}
          </button>
        </div>
      )}
    </aside>
  );
};

export default CareerProgressSidebar;
