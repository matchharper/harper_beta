import {
  Badge,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { CareerProfileSharingSettingsSection } from "./CareerProfileSettingsSection";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
} from "./ui/CareerPrimitives";
import { type CareerOpportunityAgentVariant } from "./types";
import React from "react";
import { getCareerDefaultSavedStage } from "./opportunityTypeMeta";

const countFormatter = new Intl.NumberFormat("ko-KR");
const devAgentVariantOptions: Array<{
  label: string;
  value: CareerOpportunityAgentVariant;
}> = [
  { label: "Tool agent", value: "tool_agent" },
  { label: "Rule flow", value: "scripted" },
];

const isLinkedinProfileLink = (value: string) =>
  /linkedin\.com\/in\//i.test(value.trim());

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
    stage,
    isOnboardingDone,
    activeCompanyRoleCount,
    callStartPending = false,
    opportunityRun,
    opportunityRunTriggerPending,
    talentProfile,
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
    profileSavePending,
    historyOpportunityCounts,
    historyOpportunities,
    onRefreshTalentProfileSources,
    onRunPeriodicOpportunityDiscoveryTest,
    onRunOpportunityDiscoveryTest,
    onStartCallMode,
  } = useCareerSidebarContext();
  const [devAgentVariant, setDevAgentVariant] =
    React.useState<CareerOpportunityAgentVariant>("tool_agent");

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

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
    userEmail === "hyunbin.bk@gmail.com" ||
    userEmail === "khj605123@gmail.com";

  const opportunityRunLocked =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);

  const latestRunAgentLabel =
    opportunityRun?.agentVariant === "scripted"
      ? "rule flow"
      : opportunityRun?.agentVariant === "tool_agent"
        ? "tool agent"
        : "agent 미지정";
  const latestRunLabel = opportunityRun
    ? `${opportunityRun.id.slice(0, 8)} · ${opportunityRun.status} · ${latestRunAgentLabel}`
    : "latest run 없음";

  const isOnboardingCompleted = isOnboardingDone || stage === "completed";
  const hasSavedProfileSource =
    Boolean(
      savedResumeFileName || savedResumeStoragePath || savedResumeDownloadUrl
    ) || savedProfileLinks.some(isLinkedinProfileLink);
  const hasEmptyStructuredProfile =
    talentProfile.talentExperiences.length === 0 &&
    talentProfile.talentEducations.length === 0 &&
    talentProfile.talentExtras.length === 0;
  const shouldShowProfileImportRecovery =
    hasSavedProfileSource && hasEmptyStructuredProfile;

  const callCardTitle = isOnboardingCompleted
    ? "Harper와 5분 통화"
    : "아직 5분 커리어 인터뷰가 완료되지 않았어요";

  const callCardDescription = isOnboardingCompleted ? (
    "변경된 사항이 있거나 요구사항이 있을 때 — 통화하면 빨라요"
  ) : (
    <>
      왼쪽 채팅에서 혹은 아래 통화로 간단한 질문에만 대답해주세요.
      <br />
      대화가 끝나면 내용을 정리하고, 딱맞는 기회를 받아보실 수 있게 할게요.
    </>
  );

  const onboardingChecklistItems = [
    {
      icon: UserRound,
      label: "계정",
      meta: null,
      state: "done",
    },
    {
      icon: FileText,
      label: "자료 제출",
      meta: null,
      state: "done",
    },
    {
      icon: MessageSquareText,
      label: "기준 확인",
      meta: "역할과 조건을 짧게 확인",
      state: "current",
    },
    {
      icon: Search,
      label: "추천 시작",
      meta: null,
      state: "pending",
    },
  ] as const;

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
          {shouldShowProfileImportRecovery ? (
            <div className="mt-2 flex flex-col gap-3 rounded-3xl bg-[#e8f1ff] px-3 py-3 text-[#123d73] shadow-[0_8px_20px_rgba(31,111,235,0.08)] sm:flex-row sm:items-center sm:justify-between">
              <div className="pl-2 min-w-0 text-[14px] font-medium leading-5">
                정보를 가져오는데 문제가 있었던 것 같습니다.
                <br />
                <span className="text-[12px] text-beige900/60">
                  오른쪽의 버튼을 통해 다시 시도해주세요. 불편을드려 죄송합니다.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void onRefreshTalentProfileSources()}
                disabled={profileSavePending}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1f6feb] px-3.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {profileSavePending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {profileSavePending ? "가져오는 중..." : "정보 다시 가져오기"}
              </button>
            </div>
          ) : null}
          <p className="mt-0 max-w-[620px] text-[15px] leading-5 text-beige900/65">
            {activeOpportunityLabel}
          </p>
          <div className="mt-4 w-full flex flex-row items-center justify-center gap-4">
            {/*  */}
            <div className="cursor-pointer text-beige900 text-[14px] rounded-3xl border border-beige900/15 px-4 py-3 flex flex-row items-center justify-center gap-2">
              선호 조건 업데이트하기
            </div>
            <div className="cursor-pointer text-beige900 text-[14px] rounded-3xl border border-beige900/15 px-4 py-3 flex flex-row items-center justify-center gap-2">
              더 이야기하고 연결 퀄리티 높이기
            </div>
          </div>
          <div className="mt-4 rounded-3xl border border-beige900/5 bg-beige100 px-6 py-5">
            {isOnboardingCompleted ? (
              <div className="flex flex-row items-center justify-between gap-4">
                <div className="flex h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-beige200">
                  <Phone className="h-6 w-6 text-beige700" strokeWidth={1.6} />
                </div>
                <div className="flex w-full flex-col items-start justify-center gap-1 px-4">
                  <div className="font-medium">{callCardTitle}</div>
                  <div className="text-sm text-beige900/80">
                    {callCardDescription}
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
            ) : (
              <div className="flex w-full flex-col items-center justify-center gap-1 px-4 py-2">
                <div className="flex h-12 w-12 min-w-12 items-center justify-center rounded-2xl bg-beige200">
                  <Badge className="h-6 w-6 text-beige700" strokeWidth={1.6} />
                </div>
                <div className="mt-4 text-lg font-medium">{callCardTitle}</div>
                <div className="mt-2 text-center text-sm text-beige900/80">
                  <div>{callCardDescription}</div>
                </div>
                <button
                  type="button"
                  onClick={handleStartCall}
                  disabled={callStartPending || !onStartCallMode}
                  className="mt-6 flex min-w-[130px] flex-row items-center justify-center gap-2 rounded-full bg-beige700 px-4 py-3 text-base text-beige100 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {callStartPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Phone className="h-4 w-4" strokeWidth={1.6} />
                  )}
                  {callStartPending ? "연결 중..." : "통화 시작"}
                </button>
              </div>
            )}
          </div>
          {!isOnboardingCompleted ? (
            <div className="mt-3 rounded-3xl bg-beige100 px-6 py-5">
              <div>
                <div className="text-[15px] font-semibold text-beige900">
                  커리어 인터뷰 진행 중
                </div>
                <p className="mt-1 text-[13px] leading-5 text-beige900/60">
                  원하는 기회의 기준을 확인하고 있어요.
                </p>
              </div>
              <div className="mt-4 space-y-4">
                {onboardingChecklistItems.map((item) => {
                  const ItemIcon = item.icon;

                  return (
                    <div key={item.label} className="flex items-start gap-3">
                      <span
                        className={[
                          "flex mt-px h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
                          item.state === "done"
                            ? "border-beige700 bg-beige700 text-hblack000"
                            : item.state === "current"
                              ? "border-beige700 bg-hblack000 text-beige700"
                              : "border-hblack300 bg-hblack000 text-transparent",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <div className="flex flex-row gap-1 items-start justify-start w-full">
                        <span
                          className={[
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
                            item.state === "pending"
                              ? "text-hblack400"
                              : "text-beige700",
                          ].join(" ")}
                          aria-hidden="true"
                        >
                          <ItemIcon className="h-4 w-4" strokeWidth={1.8} />
                        </span>
                        <div className="min-w-0">
                          <p
                            className={[
                              "text-sm",
                              item.state === "pending"
                                ? "text-hblack500"
                                : "text-hblack1000",
                            ].join(" ")}
                          >
                            {item.label}
                          </p>
                          {item.meta && (
                            <p className="mt-1 text-[12px] leading-5 text-hblack500">
                              {item.meta}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {isOnboardingCompleted ? (
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
          ) : null}
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-medium text-beige900/55">
                  Agent
                </span>
                {devAgentVariantOptions.map((option) => {
                  const selected = option.value === devAgentVariant;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDevAgentVariant(option.value)}
                      disabled={opportunityRunLocked}
                      className={[
                        "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        selected
                          ? "border-beige700 bg-beige700 text-white"
                          : "border-beige900/10 bg-beige50 text-beige900/65 hover:border-beige900/20",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CareerSecondaryButton
                  onClick={() =>
                    void onRunOpportunityDiscoveryTest(devAgentVariant)
                  }
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
                  onClick={() =>
                    void onRunPeriodicOpportunityDiscoveryTest(devAgentVariant)
                  }
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
                  프로필 보기
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
        <CareerProfileSharingSettingsSection showLastUpdated={false} />
      </section>
    </div>
  );
};

export default React.memo(CareerHomePanel);
