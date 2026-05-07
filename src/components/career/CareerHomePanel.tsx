import {
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import DeliveryCopyPromptTestPanel from "./DeliveryCopyPromptTestPanel";
import {
  getTalentEngagementLabels,
  getTalentCareerMoveIntentLabel,
} from "@/lib/talentNetworkOptions";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
} from "./ui/CareerPrimitives";
import {
  CareerOpportunityType,
  type CareerHistoryOpportunity,
  type CareerRecentOpportunity,
} from "./types";
import React from "react";
import { getCareerDefaultSavedStage } from "./opportunityTypeMeta";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const countFormatter = new Intl.NumberFormat("ko-KR");

const formatMatchedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(date);
};

const PreferenceRow = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) => (
  <div className="py-2 first:pt-0 last:pb-0">
    <div className="text-[13px] leading-5 text-beige900/45">{label}</div>
    <div className="mt-2 text-[15px] leading-7 text-beige900">{value}</div>
    {hint ? (
      <div className="mt-1 text-[13px] leading-5 text-beige900/45">{hint}</div>
    ) : null}
  </div>
);

type HomeHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?: "saved" | "applied" | "connected" | "closed";
};

const HomeOpportunitySummaryCard = ({
  buttonLabel,
  count,
  description,
  icon,
  iconClassName,
  onClick,
  status,
  title,
}: {
  buttonLabel: string;
  count: number;
  description: string;
  icon: React.ReactNode;
  iconClassName: string;
  onClick: () => void;
  status: string;
  title: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex min-h-[154px] w-full flex-col justify-between rounded-[16px] border border-beige900/10 bg-white px-4 py-4 text-left shadow-[0_8px_20px_rgba(37,20,6,0.05)] transition-all hover:-translate-y-0.5 hover:border-beige900/15 hover:shadow-[0_12px_28px_rgba(37,20,6,0.08)] focus:outline-none focus-visible:ring-4 focus-visible:ring-beige700/20"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[16px] font-semibold leading-5 text-beige900">
          {title}
        </div>
        <div className="mt-1 text-[12px] font-medium leading-4 text-beige900/55">
          {status}
        </div>
      </div>
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}
      >
        {icon}
      </span>
    </div>

    <div>
      <div className="mt-2 flex items-end gap-2.5">
        <span className="font-hedvig text-[34px] font-medium leading-[0.9] text-beige900 sm:text-[40px]">
          {countFormatter.format(count)}
        </span>
        <span className="pb-0.5 text-[12px] font-medium leading-4 text-beige900/55">
          {description}
        </span>
      </div>
      <span className="mt-3 inline-flex min-h-[32px] items-center gap-1 rounded-full border border-beige900/10 bg-beige50 px-3 text-[12px] font-normal text-beige900 transition-colors group-hover:border-beige900/20 group-hover:bg-beige100">
        {buttonLabel}
        <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </div>
  </button>
);

const CareerHomePanel = ({
  onOpenChat,
  onOpenHistory,
  onOpenProfile,
}: {
  onOpenChat: () => void;
  onOpenHistory: (target?: HomeHistoryTarget) => void;
  onOpenProfile: () => void;
}) => {
  const {
    user,
    activeCompanyRoleCount,
    callStartPending = false,
    opportunityRun,
    opportunityRunTriggerPending,
    talentProfile,
    talentPreferences,
    historyOpportunityCounts,
    historyOpportunities,
    onRunPeriodicOpportunityDiscoveryTest,
    onRunOpportunityDiscoveryTest,
    onStartCallMode,
  } = useCareerSidebarContext();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const engagementLabels = useMemo(
    () => getTalentEngagementLabels(talentPreferences?.engagementTypes ?? []),
    [talentPreferences?.engagementTypes]
  );

  const careerMoveIntentLabel =
    talentPreferences?.careerMoveIntentLabel ??
    getTalentCareerMoveIntentLabel(talentPreferences?.careerMoveIntent) ??
    "아직 설정되지 않았습니다.";

  const newPositionCount = historyOpportunityCounts.new;
  const newInternalOpportunityCount = useMemo(
    () =>
      historyOpportunities.filter(
        (item) => item.feedback === null && item.sourceType === "internal"
      ).length,
    [historyOpportunities]
  );
  const newPositionDescription =
    newInternalOpportunityCount > 0
      ? `추천된 기회 · ${countFormatter.format(
          newInternalOpportunityCount
        )}개 연결 가능`
      : "추천된 기회";
  const trackingPositionCount = historyOpportunityCounts.savedStages.saved;
  const appliedPositionCount = historyOpportunityCounts.savedStages.applied;
  const inProgressPositionCount = trackingPositionCount + appliedPositionCount;
  const inProgressTargetSavedStage =
    trackingPositionCount > 0 || appliedPositionCount === 0
      ? "saved"
      : "applied";
  const inProgressOpportunities = useMemo(
    () =>
      historyOpportunities.flatMap((item) => {
        if (item.feedback !== "positive") return [];
        const savedStage =
          item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);
        if (savedStage !== "saved" && savedStage !== "applied") return [];
        return [{ item, savedStage }];
      }),
    [historyOpportunities]
  );
  const inProgressCompanyLabel = useMemo(() => {
    if (inProgressPositionCount === 0) {
      return "아직 추적 중인 포지션 없음";
    }

    const firstCompanyName = (
      inProgressOpportunities.find(
        (opportunity) => opportunity.savedStage === inProgressTargetSavedStage
      ) ?? inProgressOpportunities[0]
    )?.item.companyName?.trim();
    const statusLabel =
      inProgressTargetSavedStage === "saved" ? "추적 중" : "지원 중";

    if (!firstCompanyName) {
      return `${countFormatter.format(inProgressPositionCount)}개 ${statusLabel}`;
    }

    if (inProgressPositionCount === 1) {
      return `${firstCompanyName} ${statusLabel}`;
    }

    return `${firstCompanyName} 외 ${countFormatter.format(
      inProgressPositionCount - 1
    )}개 ${statusLabel}`;
  }, [
    inProgressOpportunities,
    inProgressPositionCount,
    inProgressTargetSavedStage,
  ]);

  const activeOpportunityLabel =
    activeCompanyRoleCount > 0
      ? `현재 Harper 네트워크에서 ${countFormatter.format(
          activeCompanyRoleCount * 2
        )}개의 기회를 스캔하고 있습니다. 매일매일 더 많은 기회를 발견합니다.`
      : "현재 Harper는 새로운 기회를 계속 탐색하고 있습니다.";

  const userEmail = String(user?.email ?? "")
    .trim()
    .toLowerCase();
  const showDevRunControls =
    process.env.NODE_ENV !== "production" ||
    userEmail.endsWith("@matchharper.com") ||
    userEmail === "khj605123@gmail.com";
  const opportunityRunLocked =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);
  const latestRunLabel = opportunityRun
    ? `${opportunityRun.id.slice(0, 8)} · ${opportunityRun.status}`
    : "latest run 없음";

  const handleStartCall = () => {
    onOpenChat();
    void onStartCallMode?.();
  };

  return (
    <div className="space-y-12">
      <section className="w-full">
        <div className="w-full">
          <h2 className="mt-4 w-full text-center py-4 font-hedvig font-semibold text-[2rem] leading-none text-beige900 sm:text-[1.8rem]">
            Welcome, <span className="text-beige700">{displayName}</span>!
          </h2>
          <p className="mt-4 max-w-[620px] text-[15px] leading-5 text-beige900/65">
            Harper는 회원님만을 위한 커리어 에이전트입니다.
            <br />
            {activeOpportunityLabel}
          </p>
          <div>
            <div className="mt-4 rounded-3xl flex flex-row items-center justify-between bg-beige100 border border-beige900/5 px-6 py-5">
              <div className="w-12 h-12 min-w-12 flex items-center justify-center bg-beige200 rounded-2xl">
                <Phone className="h-6 w-6 text-beige700" strokeWidth={1.6} />
              </div>
              <div className="flex flex-col gap-1 items-start justify-center w-full px-4">
                <div className="font-medium">Harper와 5분 통화</div>
                <div className="text-sm text-beige900/80">
                  변경된 사항이 있거나 요구사항이 있을 때 — 통화하면 빨라요
                </div>
              </div>
              <button
                type="button"
                onClick={handleStartCall}
                disabled={callStartPending || !onStartCallMode}
                className="flex min-w-[130px] flex-row items-center justify-center gap-2 rounded-full bg-beige700 px-4 py-3 text-base text-beige100 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {callStartPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="h-4 w-4" strokeWidth={1.6} />
                )}
                {callStartPending ? "연결 중..." : "통화 시작"}
              </button>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HomeOpportunitySummaryCard
              title="새 포지션"
              status="검토 대기 중"
              count={newPositionCount}
              description={newPositionDescription}
              buttonLabel="검토하기"
              icon={
                <Mail className="h-5 w-5 text-[#b77a4e]" strokeWidth={1.8} />
              }
              iconClassName="bg-[#f3ede8]"
              onClick={() =>
                onOpenHistory({
                  historyTab: "new",
                  savedStage: "saved",
                })
              }
            />
            <HomeOpportunitySummaryCard
              title="진행 중"
              status="추적 + 지원"
              count={inProgressPositionCount}
              description={inProgressCompanyLabel}
              buttonLabel="상세 보기"
              icon={
                <Check className="h-6 w-6 text-[#4f8062]" strokeWidth={1.9} />
              }
              iconClassName="bg-[#e8f0eb]"
              onClick={() =>
                onOpenHistory({
                  historyTab: "saved",
                  savedStage: inProgressTargetSavedStage,
                })
              }
            />
          </div>
          {showDevRunControls ? (
            <div className="mt-5 rounded-2xl border border-dashed border-beige900/15 bg-white/70 px-4 py-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-beige900/45">
                    Dev controls
                  </div>
                  <div className="mt-1 text-[13px] leading-5 text-beige900/60">
                    latest: {latestRunLabel}
                  </div>
                </div>
                {opportunityRunLocked ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-beige900/55 sm:mt-0">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    worker 처리 대기 중
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CareerSecondaryButton
                  onClick={() => void onRunOpportunityDiscoveryTest()}
                  disabled={opportunityRunLocked}
                  className="h-10 gap-2 px-4 text-[13px]"
                >
                  {opportunityRunTriggerPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  discovery_run 추가
                </CareerSecondaryButton>
                <CareerSecondaryButton
                  onClick={() => void onRunPeriodicOpportunityDiscoveryTest()}
                  disabled={opportunityRunLocked}
                  className="h-10 gap-2 px-4 text-[13px]"
                >
                  {opportunityRunTriggerPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Clock3 className="h-3.5 w-3.5" />
                  )}
                  3일 경과 run 큐잉
                </CareerSecondaryButton>
                <CareerSecondaryButton
                  onClick={onOpenProfile}
                  className="h-10 gap-2 px-4 text-[13px]"
                >
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  Preference 보기
                </CareerSecondaryButton>
                <CareerPrimaryButton
                  onClick={onOpenChat}
                  className="h-10 gap-2 px-4 text-[13px]"
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  Chat 열기
                </CareerPrimaryButton>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* <DeliveryCopyPromptTestPanel displayName={displayName} /> */}

      <section className="mt-6">
        <h3 className="font-hedvig text-[1.2rem] font-medium leading-none text-beige900">
          My Preference
        </h3>
        <div className="mt-6">
          <PreferenceRow
            label="선호하는 형태"
            value={
              engagementLabels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {engagementLabels.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-beige900/10 bg-beige100/65 px-3 py-1 text-[13px] leading-5 text-beige900/75"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                "아직 설정되지 않았습니다."
              )
            }
          />
          <PreferenceRow label="이직 의향" value={careerMoveIntentLabel} />
        </div>
      </section>
    </div>
  );
};

export default React.memo(CareerHomePanel);
