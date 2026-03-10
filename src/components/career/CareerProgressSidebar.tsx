import { File, LogOut, Settings2, User } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import CareerVisibilitySettingsSection from "./settings/CareerVisibilitySettingsSection";
import CareerTalentProfilePanel from "./CareerTalentProfilePanel";

const CareerProgressSidebar = () => {
  const {
    user,
    stage,
    answeredCount,
    targetQuestions,
    progressPercent,
    onLogout,
  } = useCareerSidebarContext();

  const [activeTab, setActiveTab] = useState<
    "profile" | "matchings" | "settings"
  >("profile");
  const barCount = 10;

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

  const defaultTabButtonClasses =
    "inline-flex items-center gap-1.5 rounded-full min-w-12 px-4 py-2.5 text-xs transition-colors border border-hblack100";
  const activeTabButtonClasses = "bg-xprimary text-hblack000";
  const inactiveTabButtonClasses =
    "bg-hblack000 text-hblack700 hover:bg-hblack000/50";

  return (
    <aside className="lg:sticky lg:top-16 lg:self-start">
      <div className="flex flex-wrap items-center gap-2 rounded-full bg-hblack100/50 p-2">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={[
            defaultTabButtonClasses,
            activeTab === "profile"
              ? activeTabButtonClasses
              : inactiveTabButtonClasses,
          ].join(" ")}
        >
          <User className="h-3.5 w-3.5" />내 프로필
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("matchings")}
          className={[
            defaultTabButtonClasses,
            activeTab === "matchings"
              ? activeTabButtonClasses
              : inactiveTabButtonClasses,
          ].join(" ")}
        >
          <File className="h-3.5 w-3.5" />
          매칭 보기
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={[
            defaultTabButtonClasses,
            activeTab === "settings"
              ? activeTabButtonClasses
              : inactiveTabButtonClasses,
          ].join(" ")}
        >
          <Settings2 className="h-3.5 w-3.5" />
          세팅
        </button>
      </div>

      {activeTab === "profile" ? <CareerTalentProfilePanel /> : null}

      {activeTab === "matchings" ? (
        <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-6">
          <h2 className="text-lg font-medium text-hblack1000">
            매칭 진행 현황
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
            <p className="mt-1 text-xs text-hblack500">
              현재 상태: {stageLabel}
            </p>
          </div>
        </div>
      ) : null}

      {activeTab === "settings" ? (
        <div className="mt-4 rounded-2xl border border-hblack200 bg-hblack000 p-6">
          <CareerVisibilitySettingsSection />
        </div>
      ) : null}
    </aside>
  );
};

export default CareerProgressSidebar;
