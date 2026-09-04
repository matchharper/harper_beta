"use client";

import React, { useMemo } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  GalleryVerticalEnd,
  MessageSquareText,
  Search,
  Star,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CareerCallCard from "@/components/career/CareerCallCard";
import {
  useCareerHistoryContext,
  useCareerProfileContext,
  useCareerSidebarContext,
} from "@/components/career/CareerSidebarContext";
import { useCareerChatPanelContext } from "@/components/career/CareerChatPanelContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { formatCareerMessage } from "@/i18n/careerMessage";
import { useMessages } from "@/i18n/useMessage";
import { ConversationStarterActions } from "@/components/career/ConversationStarterActions";
import type { CareerOpportunitySavedStageFilter } from "@/components/career/types";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/prompts/conversationStarters";
import { ActionButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { Skeleton } from "@/components/ui/skeleton";
import InternalRoleDecisionBanner from "@/components/career/InternalRoleDecisionBanner";

const countFormatter = new Intl.NumberFormat("ko-KR");

type CareerT = ReturnType<typeof useCareerT>;

const getCurrentTimeGreeting = (date: Date, t: CareerT) => {
  const hour = date.getHours();

  if (hour < 5)
    return t("career.home.career_mobile_home_view.0snbgwi", "이른 새벽이네요.");
  if (hour < 11)
    return t("career.home.career_mobile_home_view.1j9mmu9", "좋은 아침입니다.");
  if (hour < 17)
    return t(
      "career.home.career_mobile_home_view.0w2aiar",
      "좋은 하루 보내고 계신가요?"
    );
  if (hour < 21)
    return t(
      "career.home.career_mobile_home_view.1amflsx",
      "오늘 하루는 어떠셨나요."
    );
  return t("career.home.career_mobile_home_view.0rjturg", "편안한 밤입니다.");
};

const formatMobileHomeGreetingName = (name: string, t: CareerT) => {
  const trimmedName = name.trim();

  if (!trimmedName) return "Welcome";
  if (/[A-Za-z]/.test(trimmedName)) return `Welcome, ${trimmedName}`;
  if (/^[가-힣\s]+$/.test(trimmedName)) {
    return t(
      "career.home.career_mobile_home_view.greeting_name_ko",
      "안녕하세요 {name}님",
      { values: { name: trimmedName } }
    );
  }
  return `Welcome, ${trimmedName}`;
};

type HomeHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  roleId?: string;
  savedStage?: CareerOpportunitySavedStageFilter;
};

type CareerMobileHomeViewProps = {
  onOpenChat: () => void;
  onOpenHistory: (target?: HomeHistoryTarget) => void;
};

type ChecklistState = "done" | "current" | "pending";

const ChecklistItem = ({
  icon: Icon,
  label,
  meta,
  state,
}: {
  icon: typeof UserRound;
  label: string;
  meta: string | null;
  state: ChecklistState;
}) => (
  <div className="flex items-start gap-3 text-sm">
    <span
      aria-hidden
      className={cn(
        "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors",
        state === "done" && "border-neutral-800 bg-black text-neutral-00",
        state === "current" &&
          "border-neutral-800 bg-bg-floating text-neutral-muted",
        state === "pending" &&
          "border-neutral-400 bg-bg-floating text-transparent"
      )}
    >
      <Check className="h-3 w-3" />
    </span>
    <div className="flex w-full flex-row items-start gap-1">
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
          state === "pending" ? "text-neutral-soft" : "text-neutral-muted"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm",
            state === "pending" ? "text-neutral-soft" : "text-neutral-primary"
          )}
        >
          {label}
        </p>
        {meta ? (
          <p className="mt-1 text-[12px] leading-5 text-neutral-soft">{meta}</p>
        ) : null}
      </div>
    </div>
  </div>
);

const SummaryCard = ({
  count,
  icon,
  onClick,
  label,
}: {
  count: number;
  icon: React.ReactNode;
  onClick: () => void;
  label: string;
}) => {
  const t = useCareerT();

  return (
    <ActionButton
      actionVariant="secondary"
      onClick={onClick}
      className="w-full flex flex-col w-[50%] items-center justify-center gap-4 h-24 rounded-3xl shadow-xs"
    >
      <span className={cn("inline-flex items-center justify-center")}>
        {icon}
      </span>
      <div className="text-sm font-medium text-neutral-primary">
        {t(
          "career.home.career_mobile_home_view.summary_count_label",
          "{count}개의 {label}",
          {
            values: {
              count: countFormatter.format(count),
              label,
            },
          }
        )}
      </div>
    </ActionButton>
  );
};

const CallHero = ({
  callDisabled,
  callStartPending,
  compact,
  ctaLabel,
  description,
  forceCompleteDisabled,
  forceCompletePending,
  isOnboardingCompleted,
  progressPercent,
  onForceComplete,
  onStartCall,
  title,
  extraComponent,
}: {
  callDisabled: boolean;
  callStartPending: boolean;
  compact?: boolean;
  ctaLabel?: string;
  description: React.ReactNode;
  forceCompleteDisabled?: boolean;
  forceCompletePending?: boolean;
  isOnboardingCompleted: boolean;
  progressPercent: number;
  onForceComplete?: () => void;
  onStartCall: () => void;
  title: React.ReactNode;
  extraComponent: React.ReactNode;
}) => (
  <section
    className={cn(
      "relative flex flex-col gap-2 items-center justify-center overflow-hidden pb-2",
      compact ? "min-h-[30svh]" : "min-h-[44svh]"
    )}
  >
    <CareerCallCard
      callDisabled={callDisabled}
      callStartPending={callStartPending}
      ctaLabel={ctaLabel}
      className="mt-0 w-full"
      description={description}
      forceCompleteDisabled={forceCompleteDisabled}
      forceCompletePending={forceCompletePending}
      isOnboardingCompleted={isOnboardingCompleted}
      onForceComplete={onForceComplete}
      progressPercent={progressPercent}
      onStartCall={onStartCall}
      title={title}
    />
    {extraComponent}
  </section>
);

const CareerMobileHomeSkeleton = () => {
  const t = useCareerT();

  return (
    <div
      aria-busy="true"
      aria-label={"홈 로딩 중"}
      className="flex flex-col gap-6 px-4 pb-[160px] pt-4"
    >
      <section className="relative flex min-h-[44svh] flex-col items-center justify-center gap-2 overflow-hidden pb-2">
        <div className="mt-0 w-full rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-4 py-5 shadow-sm">
          <div className="flex w-full flex-col items-center justify-center gap-2 px-2 py-2">
            <Skeleton className="h-5 w-44 rounded-full" />
            <Skeleton className="h-4 w-full max-w-[260px] rounded-full" />
            <Skeleton className="h-4 w-48 rounded-full" />
            <Skeleton className="mt-4 h-11 min-w-[60%] rounded-full" />
          </div>
        </div>
      </section>

      <div className="px-1 text-center">
        <Skeleton className="mx-auto h-8 w-48 rounded-full" />
        <Skeleton className="mx-auto mt-3 h-4 w-64 max-w-full rounded-full" />
      </div>

      <section className="flex flex-row items-center justify-between gap-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="flex h-24 w-1/2 flex-col items-center justify-center gap-4 rounded-3xl border border-neutral-1000-a10 bg-bg-floating"
          >
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        ))}
      </section>

      <div className="flex w-full flex-col gap-2">
        <Skeleton className="h-10 w-full rounded-full" />
        <Skeleton className="h-10 w-full rounded-full" />
      </div>
    </div>
  );
};

const CareerMobileHomeView = ({
  onOpenChat,
  onOpenHistory,
}: CareerMobileHomeViewProps) => {
  const t = useCareerT();

  const logCareerEvent = useCareerLogEvent();
  const {
    user,
    stage,
    isOnboardingDone,
    workspaceDataLoading,
    activeCompanyRoleCount,
    callStartPending = false,
    onStartCallMode,
    onStartConversationStarter,
    onRequestMoreOpenPositions,
    pendingInternalOpportunityCallRequest,
  } = useCareerSidebarContext();
  const {
    assistantTyping,
    chatPending,
    forceCompletePending = false,
    interviewProgress,
    onboardingWrapupPending,
    opportunityFeedbackFollowUpPending,
    onForceCompleteOnboarding,
  } = useCareerChatPanelContext();
  const { historyOpportunityCounts } = useCareerHistoryContext();
  const { talentProfile } = useCareerProfileContext();
  const { m } = useMessages();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const displayGreetingName = formatMobileHomeGreetingName(displayName, t);

  const isOnboardingCompleted = isOnboardingDone || stage === "completed";

  const newPositionCount = historyOpportunityCounts.new;

  const savedPositionCount = historyOpportunityCounts.savedStages.saved;
  const connectedPositionCount =
    historyOpportunityCounts.savedStages.applied +
    historyOpportunityCounts.savedStages.connected +
    historyOpportunityCounts.savedStages.closed;
  const inProgressPositionCount = savedPositionCount + connectedPositionCount;

  const callCardUsesCompletedLayout = isOnboardingCompleted;
  const callCardTitle = isOnboardingCompleted
    ? t("career.home.career_home_panel.0rplg97", "Harper와 5분 통화")
    : t(
        "career.home.career_home_panel.0c36lcv",
        "아직 5분 커리어 인터뷰가 완료되지 않았어요"
      );
  const currentTimeGreeting = useMemo(
    () => formatCareerMessage(m, getCurrentTimeGreeting(new Date(), t)),
    [m, t]
  );
  const currentTimeHelpText = formatCareerMessage(
    m,
    t(
      "career.home.career_mobile_home_view.0t1cxif",
      "필요하신게 있다면 알려주세요."
    )
  );

  const callCardDescription = isOnboardingCompleted ? (
    t(
      "career.home.career_mobile_home_view.1inys5s",
      "변경된 사항이 있거나 요구사항이 있을 때<br /> — 통화하면 빨라요"
    )
  ) : (
    <>
      {t(
        "career.home.career_mobile_home_view.0to563z",
        "채팅에서 혹은 통화로 간단한 질문에만 대답해주세요."
      )}
      <br />
      {t(
        "career.home.career_mobile_home_view.0lny7ac",
        "대화를 통해 회원님을 더 잘 이해하고, 좋아하실만한 기회를 받아보실 수 있게 할게요."
      )}
    </>
  );

  const handleStartCall = () => {
    logCareerEvent(
      pendingInternalOpportunityCallRequest
        ? "click_mobile_home_resume_internal_opportunity_call"
        : "click_mobile_home_start_call"
    );
    onOpenChat();
    void onStartCallMode?.(
      pendingInternalOpportunityCallRequest
        ? { internalCallRequestId: pendingInternalOpportunityCallRequest.id }
        : undefined
    );
  };

  const handleForceComplete = () => {
    if (!onForceCompleteOnboarding) return;
    logCareerEvent("click_mobile_home_force_complete");
    void onForceCompleteOnboarding();
  };

  const handleStartConversationStarter = ({
    mode,
    starterId,
  }: {
    mode: CareerConversationStarterMode;
    starterId: CareerConversationStarterId;
  }) => {
    logCareerEvent(`click_mobile_home_starter_${mode}_${starterId}`);
    onOpenChat();
    return onStartConversationStarter?.({ mode, starterId }) ?? false;
  };

  const handleRequestMoreOpenPositions = () => {
    logCareerEvent("click_mobile_home_more_open_positions");
    onOpenChat();
    return onRequestMoreOpenPositions?.() ?? false;
  };

  if (workspaceDataLoading) {
    return <CareerMobileHomeSkeleton />;
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-[160px] pt-4">
      <InternalRoleDecisionBanner
        onConfirm={(roleId) =>
          onOpenHistory({
            historyTab: "new",
            roleId: roleId ?? undefined,
          })
        }
        variant="mobile"
      />
      <CallHero
        callDisabled={!onStartCallMode}
        callStartPending={callStartPending}
        compact={historyOpportunityCounts.newInternal > 0}
        description={callCardDescription}
        extraComponent={null}
        forceCompleteDisabled={
          forceCompletePending ||
          onboardingWrapupPending ||
          chatPending ||
          assistantTyping ||
          opportunityFeedbackFollowUpPending
        }
        forceCompletePending={forceCompletePending || onboardingWrapupPending}
        isOnboardingCompleted={callCardUsesCompletedLayout}
        onForceComplete={
          !isOnboardingCompleted &&
          interviewProgress.canForceComplete &&
          onForceCompleteOnboarding
            ? handleForceComplete
            : undefined
        }
        progressPercent={interviewProgress.percent}
        onStartCall={handleStartCall}
        title={callCardTitle}
      />

      <div className="px-1 text-center">
        <h2 className="text-neutral-primary font-hedvig text-[24px] font-normal">
          {displayGreetingName}
        </h2>
        <p className="mt-2 text-[15px] font-normal text-neutral-muted">
          {currentTimeGreeting} {currentTimeHelpText}
        </p>
      </div>

      {!isOnboardingCompleted ? (
        <section className="rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-5 py-5 shadow-sm">
          <div className="text-[15px] font-medium text-neutral-primary">
            {t(
              "career.home.career_home_panel.1ol18h9",
              "커리어 인터뷰 진행 중"
            )}
          </div>
          <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
            {t(
              "career.home.career_home_panel.0qe18mm",
              "원하는 기회의 기준을 확인하고 있어요."
            )}
          </p>
          <div className="mt-4 space-y-4">
            <ChecklistItem
              icon={UserRound}
              label={t("career.home.career_home_panel.1q70b1u", "계정")}
              meta={null}
              state="done"
            />
            <ChecklistItem
              icon={FileText}
              label={t("career.home.career_home_panel.0gj76aj", "자료 제출")}
              meta={null}
              state="done"
            />
            <ChecklistItem
              icon={MessageSquareText}
              label={t("career.home.career_home_panel.0dha8ne", "기준 확인")}
              meta={t(
                "career.common.career.19aqpg8",
                "역할과 조건을 짧게 확인"
              )}
              state="current"
            />
            <ChecklistItem
              icon={Search}
              label={t("career.home.career_home_panel.15tndog", "추천 시작")}
              meta={null}
              state="pending"
            />
          </div>
        </section>
      ) : null}

      {isOnboardingCompleted && (
        <section className="flex flex-row items-center justify-between gap-2">
          <SummaryCard
            label={t("career.home.career_home_panel.0x7lgjp", "추천된 기회")}
            count={newPositionCount}
            icon={
              <GalleryVerticalEnd
                className="!h-5 !w-5 text-neutral-muted"
                strokeWidth={2.4}
              />
            }
            onClick={() =>
              onOpenHistory({ historyTab: "new", savedStage: "saved" })
            }
          />
          <SummaryCard
            label={t(
              "career.home.career_mobile_home_view.1vip5ub",
              "저장한 포지션"
            )}
            count={inProgressPositionCount}
            icon={
              <Star
                className="!h-5 !w-5 text-neutral-muted"
                strokeWidth={2.4}
              />
            }
            onClick={() =>
              onOpenHistory({
                historyTab: "saved",
                savedStage: "all",
              })
            }
          />
        </section>
      )}
      <ConversationStarterActions
        callStartPending={callStartPending}
        disabled={!onStartConversationStarter}
        onRequestMoreOpenPositions={
          isOnboardingCompleted && onRequestMoreOpenPositions
            ? handleRequestMoreOpenPositions
            : undefined
        }
        onStart={handleStartConversationStarter}
        variant="mobile"
      />
    </div>
  );
};

export default React.memo(CareerMobileHomeView);
