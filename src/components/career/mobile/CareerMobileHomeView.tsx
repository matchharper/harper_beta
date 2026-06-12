"use client";

import React, { useMemo } from "react";
import {
  Bookmark,
  Check,
  ChevronRight,
  FileText,
  GalleryVerticalEnd,
  Mail,
  MessageSquareText,
  Search,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CareerCallCard from "@/components/career/CareerCallCard";
import { InternalOpportunityCallActions } from "@/components/career/InternalOpportunityCallActions";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { ConversationStarterActions } from "@/components/career/ConversationStarterActions";
import type { CareerInternalOpportunityCallRequest } from "@/components/career/types";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { ActionButton } from "@/components/ui/button";

const countFormatter = new Intl.NumberFormat("ko-KR");

const getCurrentTimeGreeting = (date: Date) => {
  const hour = date.getHours();

  if (hour < 5) return "이른 새벽이네요.";
  if (hour < 11) return "좋은 아침입니다.";
  if (hour < 17) return "좋은 하루 보내고 계신가요?";
  if (hour < 21) return "오늘 하루는 어떠셨나요.";
  return "편안한 밤입니다.";
};

const formatMobileHomeGreetingName = (name: string) => {
  const trimmedName = name.trim();

  if (!trimmedName) return "Welcome";
  if (/[A-Za-z]/.test(trimmedName)) return `Welcome, ${trimmedName}`;
  if (/^[가-힣\s]+$/.test(trimmedName)) {
    return `안녕하세요 ${trimmedName}님`;
  }
  return `Welcome, ${trimmedName}`;
};

type HomeHistoryTarget = {
  historyTab: "new" | "saved" | "archived";
  savedStage?: "saved" | "applied" | "connected" | "closed";
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
}) => (
  <ActionButton
    actionVariant="secondary"
    onClick={onClick}
    className="w-full flex flex-col w-[50%] items-center justify-center gap-4 h-24 rounded-3xl shadow-xs"
  >
    <span className={cn("inline-flex items-center justify-center")}>
      {icon}
    </span>
    <div className="text-sm font-medium text-neutral-primary">
      {countFormatter.format(count)}개의 {label}
    </div>
  </ActionButton>
);

const CallHero = ({
  callDisabled,
  callStartPending,
  ctaLabel,
  description,
  isOnboardingCompleted,
  onStartCall,
  title,
  extraComponent,
}: {
  callDisabled: boolean;
  callStartPending: boolean;
  ctaLabel?: string;
  description: React.ReactNode;
  isOnboardingCompleted: boolean;
  onStartCall: () => void;
  title: React.ReactNode;
  extraComponent: React.ReactNode;
}) => (
  <section className="relative flex flex-col gap-2 min-h-[44svh] items-center justify-center overflow-hidden pb-2">
    <CareerCallCard
      callDisabled={callDisabled}
      callStartPending={callStartPending}
      ctaLabel={ctaLabel}
      className="mt-0 w-full"
      description={description}
      isOnboardingCompleted={isOnboardingCompleted}
      onStartCall={onStartCall}
      title={title}
    />
    {extraComponent}
  </section>
);

const CareerMobileHomeView = ({
  onOpenChat,
  onOpenHistory,
}: CareerMobileHomeViewProps) => {
  const logCareerEvent = useCareerLogEvent();
  const {
    user,
    stage,
    isOnboardingDone,
    activeCompanyRoleCount,
    callStartPending = false,
    historyOpportunityCounts,
    historyOpportunities,
    onStartCallMode,
    onStartConversationStarter,
    pendingInternalOpportunityCallRequests = [],
    talentProfile,
  } = useCareerSidebarContext();

  const displayName =
    talentProfile.talentUser?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    (typeof user?.email === "string" ? user.email.split("@")[0] : "Candidate");
  const displayGreetingName = formatMobileHomeGreetingName(displayName);

  const isOnboardingCompleted = isOnboardingDone || stage === "completed";

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

  const callCardUsesCompletedLayout = isOnboardingCompleted;
  const callCardTitle = isOnboardingCompleted
    ? "Harper와 5분 통화"
    : "아직 5분 커리어 인터뷰가 완료되지 않았어요";
  const currentTimeGreeting = useMemo(
    () => getCurrentTimeGreeting(new Date()),
    []
  );

  const callCardDescription = isOnboardingCompleted ? (
    "변경된 사항이 있거나 요구사항이 있을 때<br /> — 통화하면 빨라요"
  ) : (
    <>
      채팅에서 혹은 통화로 간단한 질문에만 대답해주세요.
      <br />
      대화를 통해 회원님을 더 잘 이해하고, 좋아하실만한 기회를 받아보실 수 있게
      할게요.
    </>
  );

  const handleStartCall = () => {
    logCareerEvent("click_mobile_home_start_call");
    onOpenChat();
    void onStartCallMode?.();
  };

  const handleStartInternalOpportunityCall = (
    callRequest: CareerInternalOpportunityCallRequest
  ) => {
    logCareerEvent("click_mobile_home_internal_opportunity_call");
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
    logCareerEvent(`click_mobile_home_starter_${mode}_${starterId}`);
    onOpenChat();
    return onStartConversationStarter?.({ mode, starterId }) ?? false;
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-[160px] pt-4">
      <CallHero
        callDisabled={!onStartCallMode}
        callStartPending={callStartPending}
        description={callCardDescription}
        isOnboardingCompleted={callCardUsesCompletedLayout}
        onStartCall={handleStartCall}
        title={callCardTitle}
        extraComponent={
          <InternalOpportunityCallActions
            callRequests={pendingInternalOpportunityCallRequests}
            callStartPending={callStartPending}
            className="mt-1"
            disabled={!onStartCallMode}
            onStart={handleStartInternalOpportunityCall}
            variant="mobile"
          />
        }
      />

      <div className="px-1 text-center">
        <h2 className="text-neutral-primary font-hedvig text-[24px] font-normal">
          {displayGreetingName}
        </h2>
        <p className="mt-2 text-[15px] font-medium text-neutral-muted">
          {currentTimeGreeting} 필요하신게 있다면 알려주세요.
        </p>
      </div>

      {!isOnboardingCompleted ? (
        <section className="rounded-3xl border border-neutral-1000-a05 bg-bg-floating px-5 py-5 shadow-sm">
          <div className="text-[15px] font-semibold text-neutral-primary">
            커리어 인터뷰 진행 중
          </div>
          <p className="mt-1 text-[13px] leading-5 text-neutral-muted">
            원하는 기회의 기준을 확인하고 있어요.
          </p>
          <div className="mt-4 space-y-4">
            <ChecklistItem
              icon={UserRound}
              label="계정"
              meta={null}
              state="done"
            />
            <ChecklistItem
              icon={FileText}
              label="자료 제출"
              meta={null}
              state="done"
            />
            <ChecklistItem
              icon={MessageSquareText}
              label="기준 확인"
              meta="역할과 조건을 짧게 확인"
              state="current"
            />
            <ChecklistItem
              icon={Search}
              label="추천 시작"
              meta={null}
              state="pending"
            />
          </div>
        </section>
      ) : null}

      {isOnboardingCompleted && (
        <section className="flex flex-row items-center justify-between gap-2">
          <SummaryCard
            label="추천된 기회"
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
            label="저장/연결된 기회"
            count={inProgressPositionCount}
            icon={
              <Bookmark
                className="!h-5 !w-5 text-neutral-muted"
                strokeWidth={2.4}
              />
            }
            onClick={() =>
              onOpenHistory({
                historyTab: "saved",
                savedStage: inProgressTargetSavedStage,
              })
            }
          />
        </section>
      )}
      <ConversationStarterActions
        callStartPending={callStartPending}
        disabled={!onStartConversationStarter}
        onStart={handleStartConversationStarter}
        variant="mobile"
      />
    </div>
  );
};

export default React.memo(CareerMobileHomeView);
