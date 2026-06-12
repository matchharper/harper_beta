import {
  BriefcaseBusiness,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  History,
  Loader2,
  Mail,
  MessageSquareText,
  Plus,
  Play,
  RefreshCw,
  Search,
  Terminal,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { CareerProfileSharingSettingsSection } from "./CareerProfileSettingsSection";
import type {
  CareerInternalOpportunityCallRequest,
  CareerOpportunityAgentVariant,
} from "./types";
import React from "react";
import CareerCallCard from "./CareerCallCard";
import { InternalOpportunityCallActions } from "./InternalOpportunityCallActions";
import { getCareerDefaultSavedStage } from "./opportunityTypeMeta";
import { ConversationStarterActions } from "./ConversationStarterActions";
import {
  ActionButton,
  InteractiveCard,
  BareButton,
} from "@/components/ui/button";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT } from "@/lib/opportunityDiscovery/types";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerDevSqlPromptHistoryStore } from "@/store/useCareerDevSqlPromptHistoryStore";
import { Text } from "@/components/ui/text";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

const countFormatter = new Intl.NumberFormat("ko-KR");
const devAgentVariantOptions: Array<{
  label: string;
  value: CareerOpportunityAgentVariant;
}> = [
  { label: "Tool agent", value: "tool_agent" },
  { label: "New rule", value: "new_rule" },
];

const getOpportunityAgentLabel = (
  value: CareerOpportunityAgentVariant | null | undefined
) => {
  if (value === "new_rule") return "new-rule";
  if (value === "tool_agent") return "tool agent";
  if (value === "scripted" || value === "scripted_human") return "legacy agent";
  return "agent 미지정";
};

const isLinkedinProfileLink = (value: string) =>
  /linkedin\.com\/in\//i.test(value.trim());

type CareerDevSqlDraft = {
  expectedResult?: string;
  explanation?: string;
  sql?: string;
  validationErrors?: string[];
  warnings?: string[];
};

type CareerDevSqlExecutionResult = {
  command?: string | null;
  rowCount?: number | null;
  rows?: unknown[];
};

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
  title,
}: {
  buttonLabel: string;
  count: number;
  description: string;
  icon: React.ReactNode;
  iconClassName: string;
  onClick: () => void;
  title: string;
}) => (
  <InteractiveCard
    onClick={onClick}
    className="group rounded-2xl flex min-h-[104px] w-full flex-col items-stretch justify-between whitespace-normal px-4 py-4 text-left text-neutral-primary"
  >
    <div className="flex items-start justify-between gap-3">
      <Text as="div" type="title">
        {title}
      </Text>
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${iconClassName}`}
      >
        {icon}
      </span>
    </div>

    <div>
      <div className="mt-0 flex items-end gap-2.5">
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
  </InteractiveCard>
);

const CareerHomePanel = ({
  onOpenChat,
  onOpenHistory,
}: {
  onOpenChat: () => void;
  onOpenHistory: (target?: HomeHistoryTarget) => void;
}) => {
  const logCareerEvent = useCareerLogEvent();
  const { fetchWithAuth } = useCareerApi();
  const devSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.prompts
  );
  const addDevSqlPromptHistory = useCareerDevSqlPromptHistoryStore(
    (state) => state.addPrompt
  );
  const {
    user,
    conversationId,
    stage,
    isOnboardingDone,
    activeCompanyRoleCount,
    callStartPending = false,
    currentDataJobPostingRecommendationTestPending,
    opportunityRun,
    opportunityRunTriggerPending,
    talentProfile,
    talentPreferences,
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
    profileSavePending,
    historyOpportunityCounts,
    historyOpportunities,
    onboardingCompletionTestPending,
    onRefreshTalentProfileSources,
    onRunCurrentDataJobPostingRecommendationTest,
    onRunOnboardingCompletionTest,
    onRunPeriodicOpportunityDiscoveryTest,
    onRunOpportunityDiscoveryTest,
    onRunSessionReengagementTest,
    onStartCallMode,
    onStartConversationStarter,
    pendingInternalOpportunityCallRequests = [],
    sessionReengagementTestPending,
  } = useCareerSidebarContext();
  const [devAgentVariant, setDevAgentVariant] =
    React.useState<CareerOpportunityAgentVariant>(
      DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT
    );
  const [devSqlRequest, setDevSqlRequest] = React.useState("");
  const [devSqlDraft, setDevSqlDraft] =
    React.useState<CareerDevSqlDraft | null>(null);
  const [devSqlText, setDevSqlText] = React.useState("");
  const [devSqlError, setDevSqlError] = React.useState("");
  const [devSqlGenerating, setDevSqlGenerating] = React.useState(false);
  const [devSqlExecuting, setDevSqlExecuting] = React.useState(false);
  const [devSqlResult, setDevSqlResult] =
    React.useState<CareerDevSqlExecutionResult | null>(null);

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
  const recommendationSettingLabel = talentPreferences
    ? talentPreferences.getExternalRecommendation &&
      talentPreferences.getInternalRecommendation
      ? "외부 공개 포지션 추천과 내부 회사 연결 제안을 받고 있어요."
      : talentPreferences.getExternalRecommendation
        ? "외부 공개 포지션 추천만 받고 있어요. 내부 회사 연결 제안은 꺼져 있어요."
        : talentPreferences.getInternalRecommendation
          ? "내부 회사 연결 제안만 받고 있어요. 외부 공개 포지션 추천은 받지 않고 있어요."
          : "외부 공개 포지션 추천과 내부 회사 연결 제안이 모두 꺼져 있어요."
    : null;

  const userEmail = String(user?.email ?? "")
    .trim()
    .toLowerCase();

  const showDevRunControls =
    process.env.NODE_ENV !== "production" ||
    userEmail.endsWith("@matchharper.com") ||
    userEmail === "hyunbin.bk@gmail.com" ||
    userEmail === "khj6051@optimizerai.xyz" ||
    userEmail === "khj605123@gmail.com";

  const opportunityRunLocked =
    opportunityRunTriggerPending || Boolean(opportunityRun?.inputLocked);
  const onboardingCompletionTestDisabled =
    onboardingCompletionTestPending || !conversationId || stage === "profile";
  const currentDataJobPostingRecommendationTestDisabled =
    currentDataJobPostingRecommendationTestPending ||
    !conversationId ||
    stage === "profile";

  const latestRunAgentLabel = getOpportunityAgentLabel(
    opportunityRun?.agentVariant
  );
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

  const callCardUsesCompletedLayout = isOnboardingCompleted;
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

  const handleStartInternalOpportunityCall = (
    callRequest: CareerInternalOpportunityCallRequest
  ) => {
    logCareerEvent("click_home_internal_opportunity_call");
    onOpenChat();
    return (
      onStartCallMode?.({
        internalCallRequestId: callRequest.id,
        openingText: `${callRequest.companyName} ${callRequest.roleTitle} 연결 건으로, 회사에 더 잘 전달할 수 있게 짧게 몇 가지를 확인하고 싶어요.`,
      }) ?? false
    );
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

  const handleGenerateDevSql = React.useCallback(async () => {
    const request = devSqlRequest.trim();
    if (!request || devSqlGenerating || devSqlExecuting) return;

    logCareerEvent("click_home_dev_sql_generate");
    addDevSqlPromptHistory(request);
    setDevSqlGenerating(true);
    setDevSqlError("");
    setDevSqlResult(null);
    try {
      const response = await fetchWithAuth("/api/talent/dev-sql", {
        method: "POST",
        body: JSON.stringify({ request }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        draft?: CareerDevSqlDraft;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(payload.error || "SQL 생성에 실패했습니다.");
      }

      setDevSqlDraft(payload.draft);
      setDevSqlText(payload.draft.sql ?? "");
    } catch (error) {
      setDevSqlError(
        error instanceof Error ? error.message : "SQL 생성에 실패했습니다."
      );
    } finally {
      setDevSqlGenerating(false);
    }
  }, [
    devSqlExecuting,
    devSqlGenerating,
    devSqlRequest,
    fetchWithAuth,
    addDevSqlPromptHistory,
    logCareerEvent,
  ]);

  const handleExecuteDevSql = React.useCallback(async () => {
    const sql = devSqlText.trim();
    if (!sql || devSqlExecuting || devSqlGenerating) return;
    if (
      !window.confirm(
        "현재 로그인 계정의 DB 상태가 변경됩니다. 표시된 SQL을 실행할까요?"
      )
    ) {
      return;
    }

    logCareerEvent("click_home_dev_sql_execute");
    setDevSqlExecuting(true);
    setDevSqlError("");
    setDevSqlResult(null);
    try {
      const response = await fetchWithAuth("/api/talent/dev-sql", {
        method: "PATCH",
        body: JSON.stringify({ sql }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        result?: CareerDevSqlExecutionResult;
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "SQL 실행에 실패했습니다.");
      }

      setDevSqlResult(payload.result);
    } catch (error) {
      setDevSqlError(
        error instanceof Error ? error.message : "SQL 실행에 실패했습니다."
      );
    } finally {
      setDevSqlExecuting(false);
    }
  }, [
    devSqlExecuting,
    devSqlGenerating,
    devSqlText,
    fetchWithAuth,
    logCareerEvent,
  ]);

  return (
    <div className="space-y-4 text-neutral-primary">
      <Text as="h2" type="head1" className="mt-8 text-center font-hedvig">
        Welcome, <span className="text-primary">{displayName}</span>!
      </Text>
      {shouldShowProfileImportRecovery && (
        <div className="mt-2 mb-4 flex flex-col gap-3 rounded-3xl border border-info/30 bg-bg-floating px-3 py-3 text-info shadow-[0_8px_20px_color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)] sm:flex-row sm:items-center sm:justify-between">
          <Text as="div" type="label" className="min-w-0 pl-2">
            정보를 가져오는데 문제가 있었던 것 같습니다.
            <br />
            <Text as="span" type="caption">
              오른쪽의 버튼을 통해 다시 시도해주세요. 불편을드려 죄송합니다.
            </Text>
          </Text>
          <ActionButton
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
          </ActionButton>
        </div>
      )}
      <div>
        <Text type="desc" className="text-center">
          {activeOpportunityLabel}
        </Text>
        {recommendationSettingLabel && (
          <Text type="desc" className="mt-2 text-center">
            {recommendationSettingLabel}
          </Text>
        )}
      </div>
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
        isOnboardingCompleted={callCardUsesCompletedLayout}
        onStartCall={handleStartCall}
        title={callCardTitle}
      />
      <InternalOpportunityCallActions
        callRequests={pendingInternalOpportunityCallRequests}
        callStartPending={callStartPending}
        className="mt-2"
        disabled={!onStartCallMode}
        onStart={handleStartInternalOpportunityCall}
      />
      {!isOnboardingCompleted ? (
        <div className="rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-6 py-5 shadow-sm">
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
                        ? "border-neutral-800 bg-black text-neutral-00"
                        : item.state === "current"
                          ? "border-neutral-800 bg-bg-floating text-neutral-muted"
                          : "border-neutral-400 bg-bg-floating text-transparent",
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
                          ? "text-neutral-soft"
                          : "text-neutral-muted",
                      ].join(" ")}
                      aria-hidden="true"
                    >
                      <ItemIcon className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={
                          item.state === "pending"
                            ? "text-neutral-soft"
                            : "text-neutral-primary"
                        }
                      >
                        {item.label}
                      </p>
                      {item.meta && (
                        <p className="mt-1 text-[12px] leading-5 text-neutral-soft">
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
            title="새로 받은 기회"
            count={newPositionCount}
            description={newPositionDescription}
            buttonLabel="검토하기"
            icon={<Mail className="h-5 w-5 text-primary" strokeWidth={1.8} />}
            iconClassName="bg-accent-200"
            onClick={() =>
              onOpenHistory({
                historyTab: "new",
                savedStage: "saved",
              })
            }
          />
          <HomeOpportunitySummaryCard
            title="저장 / 연결"
            count={inProgressPositionCount}
            description={inProgressCompanyLabel}
            buttonLabel="상세 보기"
            icon={<Check className="h-6 w-6 text-positive" strokeWidth={1.9} />}
            iconClassName="bg-positive-faded"
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
        <div className="mt-5 rounded-2xl border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 shadow-sm">
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
                <ActionButton
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
                </ActionButton>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
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
            </ActionButton>
            <ActionButton
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
            </ActionButton>
            <ActionButton
              onClick={() => {
                logCareerEvent(
                  "click_home_dev_current_data_job_posting_recommendation"
                );
                onOpenChat();
                void onRunCurrentDataJobPostingRecommendationTest();
              }}
              disabled={currentDataJobPostingRecommendationTestDisabled}
              actionVariant="secondary"
            >
              {currentDataJobPostingRecommendationTestPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BriefcaseBusiness className="h-3.5 w-3.5" />
              )}
              현재 데이터로 공고 추천
            </ActionButton>
            <ActionButton
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
            </ActionButton>
            <ActionButton
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
            </ActionButton>
            <ActionButton
              onClick={() => {
                logCareerEvent("click_home_dev_reengagement_greeting_only");
                void onRunSessionReengagementTest({
                  deleteLatestMessage: false,
                });
              }}
              disabled={sessionReengagementTestPending}
              actionVariant="secondary"
            >
              {sessionReengagementTestPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Clock3 className="h-3.5 w-3.5" />
              )}
              6시간 인사만
            </ActionButton>
          </div>
          <div className="mt-4 border-t border-neutral-1000-a05 pt-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Text as="div" type="eyebrow">
                  현재 상태 변경
                </Text>
                <Text as="div" type="subtle" className="mt-1">
                  현재 로그인 계정에 한정된 상태를 변경하기 위한 명령어를
                  생성하고 실행
                </Text>
              </div>
              <ActionButton
                onClick={() => void handleGenerateDevSql()}
                disabled={
                  devSqlGenerating ||
                  devSqlExecuting ||
                  devSqlRequest.trim().length === 0
                }
                actionVariant="secondary"
                className="mt-2 sm:mt-0"
              >
                {devSqlGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Terminal className="h-3.5 w-3.5" />
                )}
                {devSqlGenerating ? "생성 중..." : "적용할 SQL 생성"}
              </ActionButton>
            </div>
            <UiTextarea
              unstyled
              value={devSqlRequest}
              onChange={(event) => setDevSqlRequest(event.target.value)}
              placeholder="예: 추천된 기회 전부 삭제 / 최근 3일간 모든 추천 데이터 삭제"
              rows={3}
              className="mt-3 min-h-[86px] w-full resize-y rounded-xl border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-[13px] leading-5 text-neutral-primary outline-none transition-colors placeholder:text-neutral-placeholder focus:border-neutral-800"
            />
            {devSqlPromptHistory.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                <Text
                  as="div"
                  type="subtle"
                  className="inline-flex items-center gap-1.5"
                >
                  <History className="h-3.5 w-3.5" />
                  최근 입력
                </Text>
                <div className="flex flex-wrap gap-1.5">
                  {devSqlPromptHistory.map((prompt) => (
                    <BareButton
                      key={prompt}
                      type="button"
                      onClick={() => {
                        logCareerEvent("click_home_dev_sql_prompt_history");
                        setDevSqlRequest(prompt);
                      }}
                      className="max-w-full rounded-lg border border-neutral-1000-a05 bg-bg-floating px-2.5 py-1.5 text-left text-[12px] leading-4 text-neutral-primary transition-colors hover:border-neutral-800/40 hover:bg-bg-weak focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                    >
                      <span className="block max-w-[240px] truncate sm:max-w-[320px]">
                        {prompt}
                      </span>
                    </BareButton>
                  ))}
                </div>
              </div>
            ) : null}
            {devSqlError ? (
              <div className="mt-3 flex gap-2 rounded-xl border border-critical/30 bg-critical-faded px-3 py-2 text-[12px] leading-5 text-critical">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">{devSqlError}</span>
              </div>
            ) : null}
            {devSqlDraft ? (
              <div className="mt-3 space-y-3 rounded-xl border border-neutral-1000-a05 bg-bg-floating px-3 py-3 shadow-sm">
                {devSqlDraft.explanation ? (
                  <Text
                    as="div"
                    type="caption"
                    className="text-neutral-primary"
                  >
                    {devSqlDraft.explanation}
                  </Text>
                ) : null}
                {devSqlDraft.expectedResult ? (
                  <Text as="div" type="subtle">
                    결과: {devSqlDraft.expectedResult}
                  </Text>
                ) : null}
                {devSqlDraft.warnings?.length ? (
                  <div className="space-y-1">
                    {devSqlDraft.warnings.map((warning, index) => (
                      <Text
                        key={`${warning}-${index}`}
                        as="div"
                        type="caption"
                        className="text-primary"
                      >
                        주의: {warning}
                      </Text>
                    ))}
                  </div>
                ) : null}
                {devSqlDraft.validationErrors?.length ? (
                  <div className="space-y-1 rounded-lg bg-critical-faded px-3 py-2">
                    {devSqlDraft.validationErrors.map((validationError) => (
                      <Text
                        key={validationError}
                        as="div"
                        type="caption"
                        className="text-critical"
                      >
                        {validationError}
                      </Text>
                    ))}
                  </div>
                ) : null}
                <UiTextarea
                  unstyled
                  value={devSqlText}
                  onChange={(event) => setDevSqlText(event.target.value)}
                  rows={9}
                  spellCheck={false}
                  className="min-h-[210px] w-full resize-y rounded-xl border border-neutral-1000-a10 bg-bg-floating px-3 py-2 font-mono text-[12px] leading-5 text-neutral-primary outline-none transition-colors focus:border-neutral-800"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {devSqlResult ? (
                    <Text as="div" type="subtle">
                      실행됨: {devSqlResult.command ?? "OK"}
                      {typeof devSqlResult.rowCount === "number"
                        ? ` · ${devSqlResult.rowCount} rows`
                        : ""}
                    </Text>
                  ) : (
                    <Text as="div" type="subtle">
                      실행 전 SQL을 직접 확인하세요.
                    </Text>
                  )}
                  <ActionButton
                    onClick={() => void handleExecuteDevSql()}
                    disabled={
                      devSqlExecuting ||
                      devSqlGenerating ||
                      devSqlText.trim().length === 0
                    }
                    actionVariant="primary"
                  >
                    {devSqlExecuting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {devSqlExecuting ? "실행 중..." : "SQL 실행"}
                  </ActionButton>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(CareerHomePanel);
