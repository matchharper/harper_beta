import {
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { CareerProfileSharingSettingsSection } from "./CareerProfileSettingsSection";
import { type CareerOpportunityAgentVariant } from "./types";
import React from "react";
import CareerCallCard from "./CareerCallCard";
import { getCareerDefaultSavedStage } from "./opportunityTypeMeta";
import { ConversationStarterActions } from "./ConversationStarterActions";
import {
  CareerActionButton,
  CareerInteractiveCard,
} from "./ui/CareerActionButton";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { Text } from "@/components/ui/typography";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";

const countFormatter = new Intl.NumberFormat("ko-KR");
const devAgentVariantOptions: Array<{
  label: string;
  value: CareerOpportunityAgentVariant;
}> = [
  { label: "Tool agent", value: "tool_agent" },
  { label: "Rule flow", value: "scripted" },
  { label: "Human scripted v1", value: "scripted_human" },
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
  <CareerInteractiveCard
    onClick={onClick}
    className="group rounded-2xl flex min-h-[154px] w-full flex-col items-stretch justify-between whitespace-normal px-4 py-4 text-left text-beige900"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <Text as="div" type="title">
          {title}
        </Text>
        <Text as="div" type="subtle" className="mt-1">
          {status}
        </Text>
      </div>
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}
      >
        {icon}
      </span>
    </div>

    <div>
      <div className="mt-2 flex items-end gap-2.5">
        <Text as="span" type="metric">
          {countFormatter.format(count)}
        </Text>
        <Text as="span" type="subtle" className="pb-0.5">
          {description}
        </Text>
      </div>
      <Text
        as="span"
        type="caption"
        className="mt-3 inline-flex items-center gap-1"
      >
        {buttonLabel}
        <ChevronRight className="h-3 w-3" />
      </Text>
    </div>
  </CareerInteractiveCard>
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
  const logCareerEvent = useCareerLogEvent();
  const {
    user,
    conversationId,
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
    onboardingCompletionTestPending,
    onRefreshTalentProfileSources,
    onRunOnboardingCompletionTest,
    onRunPeriodicOpportunityDiscoveryTest,
    onRunOpportunityDiscoveryTest,
    onRunSessionReengagementTest,
    onStartCallMode,
    onStartConversationStarter,
    sessionReengagementTestPending,
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
  const savedPositionCount = historyOpportunityCounts.savedStages.saved;
  const connectedPositionCount =
    historyOpportunityCounts.savedStages.applied +
    historyOpportunityCounts.savedStages.connected +
    historyOpportunityCounts.savedStages.closed;
  const inProgressPositionCount = savedPositionCount + connectedPositionCount;
  const inProgressTargetSavedStage =
    savedPositionCount > 0 || connectedPositionCount === 0
      ? "saved"
      : "connected";
  const inProgressOpportunities = useMemo(
    () =>
      historyOpportunities.flatMap((item) => {
        if (item.feedback !== "positive") return [];
        const savedStage =
          item.savedStage ?? getCareerDefaultSavedStage(item.opportunityType);
        if (
          savedStage !== "saved" &&
          savedStage !== "applied" &&
          savedStage !== "connected" &&
          savedStage !== "closed"
        ) {
          return [];
        }
        return [{ item, savedStage }];
      }),
    [historyOpportunities]
  );
  const inProgressCompanyLabel = useMemo(() => {
    if (inProgressPositionCount === 0) {
      return "아직 저장하거나 연결된 포지션 없음";
    }

    const firstCompanyName = (
      inProgressOpportunities.find((opportunity) =>
        inProgressTargetSavedStage === "saved"
          ? opportunity.savedStage === "saved"
          : opportunity.savedStage !== "saved"
      ) ?? inProgressOpportunities[0]
    )?.item.companyName?.trim();
    const statusLabel =
      inProgressTargetSavedStage === "saved" ? "저장함" : "연결됨";

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
  const onboardingCompletionTestDisabled =
    onboardingCompletionTestPending || !conversationId || stage === "profile";

  const latestRunAgentLabel =
    opportunityRun?.agentVariant === "scripted"
      ? "rule flow"
      : opportunityRun?.agentVariant === "scripted_human"
        ? "human scripted v1"
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
    logCareerEvent("click_home_start_call");
    onOpenChat();
    void onStartCallMode?.();
  };

  const handleStartConversationStarter = ({
    mode,
    starterId,
  }: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => {
    logCareerEvent(`click_home_starter_${mode}_${starterId}`);
    onOpenChat();
    return onStartConversationStarter?.({ mode, starterId }) ?? false;
  };

  return (
    <div className="space-y-4 text-beige900">
      <Text as="h2" type="head1" className="mt-8 text-center font-hedvig">
        Welcome, <span className="text-beige700">{displayName}</span>!
      </Text>
      {shouldShowProfileImportRecovery && (
        <div className="mt-2 mb-4 flex flex-col gap-3 rounded-3xl bg-[#e8f1ff] px-3 py-3 text-[#123d73] shadow-[0_8px_20px_rgba(31,111,235,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <Text as="div" type="label" className="min-w-0 pl-2">
            정보를 가져오는데 문제가 있었던 것 같습니다.
            <br />
            <Text as="span" type="caption">
              오른쪽의 버튼을 통해 다시 시도해주세요. 불편을드려 죄송합니다.
            </Text>
          </Text>
          <CareerActionButton
            onClick={() => {
              logCareerEvent("click_home_refresh_profile_sources");
              void onRefreshTalentProfileSources();
            }}
            disabled={profileSavePending}
            actionVariant="primary"
            className="shrink-0"
          >
            {profileSavePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {profileSavePending ? "가져오는 중..." : "정보 다시 가져오기"}
          </CareerActionButton>
        </div>
      )}
      <Text type="desc" className="text-center">
        {activeOpportunityLabel}
      </Text>
      {isOnboardingCompleted && (
        <ConversationStarterActions
          callStartPending={callStartPending}
          className="mt-12"
          disabled={!onStartConversationStarter}
          onStart={handleStartConversationStarter}
        />
      )}
      <CareerCallCard
        callDisabled={!onStartCallMode}
        callStartPending={callStartPending}
        description={callCardDescription}
        isOnboardingCompleted={isOnboardingCompleted}
        onStartCall={handleStartCall}
        title={callCardTitle}
      />
      {!isOnboardingCompleted ? (
        <div className="rounded-3xl bg-beige100 px-6 py-5">
          <SectionHeader className="gap-1">
            <SectionTitle as="h3">커리어 인터뷰 진행 중</SectionTitle>
            <SectionDescription className="max-w-none">
              원하는 기회의 기준을 확인하고 있어요.
            </SectionDescription>
          </SectionHeader>
          <div className="mt-4 space-y-4">
            {onboardingChecklistItems.map((item) => {
              const ItemIcon = item.icon;

              return (
                <div
                  key={item.label}
                  className="flex items-start gap-3 text-sm"
                >
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
                        className={
                          item.state === "pending"
                            ? "text-hblack500"
                            : "text-hblack1000"
                        }
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
        <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <HomeOpportunitySummaryCard
            title="새 포지션"
            status="검토 대기 중"
            count={newPositionCount}
            description={newPositionDescription}
            buttonLabel="검토하기"
            icon={<Mail className="h-5 w-5 text-[#b77a4e]" strokeWidth={1.8} />}
            iconClassName="bg-[#f3ede8]"
            onClick={() =>
              onOpenHistory({
                historyTab: "new",
                savedStage: "saved",
              })
            }
          />
          <HomeOpportunitySummaryCard
            title="저장 / 연결"
            status="저장함 + 연결됨"
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

      <div className="mt-12" />
      <CareerProfileSharingSettingsSection showLastUpdated={false} />

      {showDevRunControls ? (
        <div className="mt-5 rounded-2xl border border-dashed border-beige900/15 bg-white/70 px-4 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Text as="div" type="eyebrow">
                Dev controls
              </Text>
              <Text as="div" type="subtle" className="mt-1">
                latest: {latestRunLabel}
              </Text>
            </div>
            {opportunityRunLocked ? (
              <Text
                as="div"
                type="subtle"
                className="mt-1 inline-flex items-center gap-1.5 sm:mt-0"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                worker 처리 대기 중
              </Text>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Text as="span" type="subtle">
              Agent
            </Text>
            {devAgentVariantOptions.map((option) => {
              const selected = option.value === devAgentVariant;
              return (
                <CareerActionButton
                  key={option.value}
                  onClick={() => {
                    logCareerEvent(
                      `click_home_dev_agent_variant_${option.value}`
                    );
                    setDevAgentVariant(option.value);
                  }}
                  disabled={opportunityRunLocked}
                  active={selected}
                  actionVariant="secondary"
                >
                  {option.label}
                </CareerActionButton>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_dev_discovery_run");
                void onRunOpportunityDiscoveryTest(devAgentVariant);
              }}
              disabled={opportunityRunLocked}
              actionVariant="secondary"
            >
              {opportunityRunTriggerPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              discovery_run 추가
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_dev_periodic_discovery_run");
                void onRunPeriodicOpportunityDiscoveryTest(devAgentVariant);
              }}
              disabled={opportunityRunLocked}
              actionVariant="secondary"
            >
              {opportunityRunTriggerPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock3 className="h-3.5 w-3.5" />
              )}
              3일 경과 run 큐잉
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_dev_onboarding_completion_test");
                void Promise.resolve(onRunOnboardingCompletionTest()).then(
                  (ok) => {
                    if (ok) onOpenChat();
                  }
                );
              }}
              disabled={onboardingCompletionTestDisabled}
              actionVariant="secondary"
            >
              {onboardingCompletionTestPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              온보딩 종료 테스트
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_dev_reengagement_test");
                void onRunSessionReengagementTest();
              }}
              disabled={sessionReengagementTestPending}
              actionVariant="secondary"
            >
              {sessionReengagementTestPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              최근 메시지 삭제 + 6시간 인사
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_open_profile");
                onOpenProfile();
              }}
              actionVariant="secondary"
            >
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              프로필 보기
            </CareerActionButton>
            <CareerActionButton
              onClick={() => {
                logCareerEvent("click_home_open_chat");
                onOpenChat();
              }}
              actionVariant="primary"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              Chat 열기
            </CareerActionButton>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(CareerHomePanel);
