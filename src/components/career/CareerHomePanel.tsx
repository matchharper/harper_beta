import {
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo } from "react";
import { useCareerSidebarContext } from "./CareerSidebarContext";
import { CareerProfileSharingSettingsSection } from "./CareerProfileSettingsSection";
import type {
  CareerInternalOpportunityCallRequest,
  CareerOpportunitySavedStageFilter,
} from "./types";
import React from "react";
import CareerCallCard from "./CareerCallCard";
import CareerHomeDevControls from "./CareerHomeDevControls";
import { InternalOpportunityCallActions } from "./InternalOpportunityCallActions";
import { getCareerDefaultSavedStage } from "./opportunityTypeMeta";
import { ConversationStarterActions } from "./ConversationStarterActions";
import { ActionButton, InteractiveCard } from "@/components/ui/button";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import {
  formatCareerMessage,
  formatCareerMessageByKey,
} from "@/i18n/careerMessage";
import { useMessages } from "@/i18n/useMessage";
import { Text } from "@/components/ui/text";
import {
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/ui/section-header";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import { Skeleton } from "@/components/ui/skeleton";
import InternalRoleDecisionBanner from "@/components/career/InternalRoleDecisionBanner";

const countFormatter = new Intl.NumberFormat("ko-KR");

const isLinkedinProfileLink = (value: string) =>
  /linkedin\.com\/in\//i.test(value.trim());

type HomeHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  roleId?: string;
  savedStage?: CareerOpportunitySavedStageFilter;
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

const CareerHomePanelSkeleton = () => {
  const t = useCareerT();

  return (
    <div
      aria-busy="true"
      aria-label={"홈 로딩 중"}
      className="space-y-4 text-neutral-primary"
    >
      <Skeleton className="mx-auto mt-8 h-9 w-9/12 max-w-[360px] rounded-full" />
      <div className="space-y-2 pt-1">
        <Skeleton className="mx-auto h-4 w-10/12 max-w-[520px] rounded-full" />
        <Skeleton className="mx-auto h-4 w-8/12 max-w-[420px] rounded-full" />
      </div>

      <div className="mt-12 flex w-full flex-row flex-wrap items-center justify-center gap-2">
        <Skeleton className="h-10 w-full max-w-[260px] rounded-full" />
        <Skeleton className="h-10 w-full max-w-[260px] rounded-full" />
      </div>

      <div className="mt-6 rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 shadow-sm md:px-6">
        <div className="flex flex-col items-center justify-between gap-2 md:flex-row">
          <Skeleton className="hidden h-14 w-14 min-w-14 rounded-lg md:flex" />
          <div className="flex w-full flex-col items-start justify-center gap-2 px-2 md:gap-1">
            <Skeleton className="h-5 w-full max-w-[220px] rounded-full" />
            <Skeleton className="h-4 w-full max-w-[360px] rounded-full" />
          </div>
          <Skeleton className="mt-4 h-11 min-w-[60%] rounded-full md:mt-0 md:min-w-[130px]" />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="flex min-h-[104px] w-full flex-col justify-between rounded-2xl border border-neutral-1000-a10 bg-bg-floating px-4 py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-28 rounded-full" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-[12px]" />
            </div>
            <div>
              <div className="mt-0 flex items-end gap-2.5">
                <Skeleton className="h-10 w-16 rounded-full" />
                <Skeleton className="mb-1 h-4 w-32 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-4 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12" />
      <div className="rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm">
        <Skeleton className="h-4 w-40 rounded-full" />
        <Skeleton className="mt-3 h-4 w-full max-w-[520px] rounded-full" />
        <Skeleton className="mt-4 h-10 w-36 rounded-full" />
      </div>
    </div>
  );
};

const CareerHomePanel = ({
  onOpenChat,
  onOpenHistory,
}: {
  onOpenChat: () => void;
  onOpenHistory: (target?: HomeHistoryTarget) => void;
}) => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const {
    user,
    stage,
    isOnboardingDone,
    workspaceDataLoading,
    activeCompanyRoleCount,
    callStartPending = false,
    talentProfile,
    talentPreferences,
    profileVisibility,
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
    profileSavePending,
    historyOpportunityCounts,
    historyOpportunities,
    onRefreshTalentProfileSources,
    onStartCallMode,
    onStartConversationStarter,
    onRequestMoreOpenPositions,
    pendingInternalOpportunityCallRequests = [],
  } = useCareerSidebarContext();
  const { m } = useMessages();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");

  const newPositionCount = historyOpportunityCounts.new;
  const newPositionDescription = formatCareerMessage(
    m,
    t("career.home.career_home_panel.0x7lgjp", "추천된 기회")
  );
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
      return t(
        "career.home.career_home_panel.1psd54b",
        "아직 저장하거나 연결된 포지션 없음"
      );
    }

    const firstCompanyName = (
      inProgressOpportunities.find((opportunity) =>
        inProgressTargetSavedStage === "saved"
          ? opportunity.savedStage === "saved"
          : opportunity.savedStage !== "saved"
      ) ?? inProgressOpportunities[0]
    )?.item.companyName?.trim();
    const statusLabel =
      inProgressTargetSavedStage === "saved"
        ? t("career.common.career_history_panel.interested_status", "관심 있음")
        : t("career.common.career_history_panel.0y27adb", "진행중");

    if (!firstCompanyName) {
      return t("career.home.career_home_panel.1qhpcnm", "{count}개 {status}", {
        values: {
          count: countFormatter.format(inProgressPositionCount),
          status: statusLabel,
        },
      });
    }

    if (inProgressPositionCount === 1) {
      return formatCareerMessage(m, "{company} {status}", {
        company: firstCompanyName,
        status: statusLabel,
      });
    }

    return t(
      "career.home.career_home_panel.0ejjdwp",
      "{company} 외 {count}개 {status}",
      {
        values: {
          company: firstCompanyName,
          count: countFormatter.format(inProgressPositionCount - 1),
          status: statusLabel,
        },
      }
    );
  }, [
    inProgressOpportunities,
    inProgressPositionCount,
    inProgressTargetSavedStage,
    m,
    t,
  ]);

  const activeOpportunityLabel =
    activeCompanyRoleCount > 0
      ? formatCareerMessage(
          m,
          t(
            "career.home.career_home_panel.1jcg4hg",
            "현재 Harper 네트워크에서 {count}개의 기회를 스캔하고 있습니다. 매일매일 더 많은 기회를 발견합니다."
          ),
          {
            count: countFormatter.format(activeCompanyRoleCount * 2),
          }
        )
      : formatCareerMessage(
          m,
          t(
            "career.home.career_home_panel.0rlf0ya",
            "현재 Harper는 새로운 기회를 계속 탐색하고 있습니다."
          )
        );
  const recommendationSettingLabel = talentPreferences
    ? profileVisibility === "dont_share"
      ? t(
          "career.home.career_home_panel.1dfqgdw",
          "외부 공개 포지션 추천과 내부 회사 연결 제안이 모두 꺼져 있어요."
        )
      : talentPreferences.getExternalRecommendation
        ? t(
            "career.home.career_home_panel.1dtmpgt",
            "외부 공개 포지션 추천과 내부 회사 연결 제안을 받고 있어요."
          )
        : t(
            "career.home.career_home_panel.1l3sw8y",
            "내부 회사 연결 제안만 받고 있어요. 외부 공개 포지션 추천은 받지 않고 있어요."
          )
    : null;

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
    ? t("career.home.career_home_panel.0rplg97", "Harper와 5분 통화")
    : t(
        "career.home.career_home_panel.0c36lcv",
        "아직 5분 커리어 인터뷰가 완료되지 않았어요"
      );

  const callCardDescription = isOnboardingCompleted ? (
    t(
      "career.home.career_home_panel.0bq7bs7",
      "변경된 사항이 있거나 요구사항이 있을 때 — 통화하면 빨라요"
    )
  ) : (
    <>
      {t(
        "career.home.career_home_panel.05hgw7c",
        "왼쪽 채팅에서 혹은 아래 통화로 간단한 질문에만 대답해주세요."
      )}
      <br />
      {t(
        "career.home.career_home_panel.0e3tusc",
        "대화가 끝나면 내용을 정리하고, 딱맞는 기회를 받아보실 수 있게 할게요."
      )}
    </>
  );

  const onboardingChecklistItems = [
    {
      icon: UserRound,
      label: t("career.home.career_home_panel.1q70b1u", "계정"),
      meta: null,
      state: "done",
    },
    {
      icon: FileText,
      label: t("career.home.career_home_panel.0gj76aj", "자료 제출"),
      meta: null,
      state: "done",
    },
    {
      icon: MessageSquareText,
      label: t("career.home.career_home_panel.0dha8ne", "기준 확인"),
      meta: t(
        "career.home.career_home_panel.19aqpg8",
        "역할과 조건을 짧게 확인"
      ),
      state: "current",
    },
    {
      icon: Search,
      label: t("career.home.career_home_panel.15tndog", "추천 시작"),
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
        openingText: formatCareerMessageByKey(
          m,
          "career.internal_opportunity.call_opening",
          "",
          {
            companyName: callRequest.companyName,
            roleTitle: callRequest.roleTitle,
          }
        ),
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

  const handleRequestMoreOpenPositions = () => {
    logCareerEvent("click_home_more_open_positions");
    onOpenChat();
    return onRequestMoreOpenPositions?.() ?? false;
  };

  if (workspaceDataLoading) {
    return <CareerHomePanelSkeleton />;
  }

  return (
    <div className="space-y-4 text-neutral-primary">
      <Text as="h2" type="head1" className="mt-8 text-center font-hedvig">
        Welcome, <span className="text-primary">{displayName}</span>!
      </Text>
      {shouldShowProfileImportRecovery && (
        <div className="mt-2 mb-4 flex flex-col gap-3 rounded-3xl border border-info/30 bg-bg-floating px-3 py-3 text-info shadow-[0_8px_20px_color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)] sm:flex-row sm:items-center sm:justify-between">
          <Text as="div" type="label" className="min-w-0 pl-2">
            {t(
              "career.home.career_home_panel.0vplw45",
              "정보를 가져오는데 문제가 있었던 것 같습니다."
            )}
            <br />
            <Text as="span" type="caption">
              {t(
                "career.home.career_home_panel.0zkc0rv",
                "오른쪽의 버튼을 통해 다시 시도해주세요. 불편을드려 죄송합니다."
              )}
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
            {profileSavePending
              ? t("career.home.career_home_panel.1frpdtk", "가져오는 중...")
              : t(
                  "career.home.career_home_panel.024uw9c",
                  "정보 다시 가져오기"
                )}
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
          onRequestMoreOpenPositions={
            onRequestMoreOpenPositions
              ? handleRequestMoreOpenPositions
              : undefined
          }
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
      <InternalRoleDecisionBanner
        onConfirm={(roleId) =>
          onOpenHistory({
            historyTab: "new",
            roleId: roleId ?? undefined,
          })
        }
        variant="desktop"
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
            <SectionTitle as="h3">
              {t(
                "career.home.career_home_panel.1ol18h9",
                "커리어 인터뷰 진행 중"
              )}
            </SectionTitle>
            <SectionDescription className="max-w-none">
              {t(
                "career.home.career_home_panel.0qe18mm",
                "원하는 기회의 기준을 확인하고 있어요."
              )}
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
            title={t("career.home.career_home_panel.0sdf230", "추천된 기회")}
            count={newPositionCount}
            description={newPositionDescription}
            buttonLabel={t("career.common.career.1nldebx", "검토하기")}
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
            title={t("career.home.career_home_panel.11q0oj9", "저장한 포지션")}
            count={inProgressPositionCount}
            description={inProgressCompanyLabel}
            buttonLabel={t("career.common.career.028kv4g", "상세 보기")}
            icon={<Check className="h-6 w-6 text-positive" strokeWidth={1.9} />}
            iconClassName="bg-positive-faded"
            onClick={() =>
              onOpenHistory({
                historyTab: "saved",
                savedStage: "all",
              })
            }
          />
        </div>
      ) : null}

      <div className="mt-12" />
      <CareerProfileSharingSettingsSection
        showEngagementTypes={false}
        showLastUpdated={false}
      />

      <CareerHomeDevControls onOpenChat={onOpenChat} />
    </div>
  );
};

export default React.memo(CareerHomePanel);
