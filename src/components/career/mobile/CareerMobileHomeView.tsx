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
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { ConversationStarterActions } from "@/components/career/ConversationStarterActions";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";
import { CareerActionButton } from "../ui/CareerActionButton";

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
        state === "done" && "border-beige700 bg-beige700 text-hblack000",
        state === "current" && "border-beige700 bg-hblack000 text-beige700",
        state === "pending" && "border-hblack300 bg-hblack000 text-transparent"
      )}
    >
      <Check className="h-3 w-3" />
    </span>
    <div className="flex w-full flex-row items-start gap-1">
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors",
          state === "pending" ? "text-hblack400" : "text-beige700"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-sm",
            state === "pending" ? "text-hblack500" : "text-hblack1000"
          )}
        >
          {label}
        </p>
        {meta ? (
          <p className="mt-1 text-[12px] leading-5 text-hblack500">{meta}</p>
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
  <CareerActionButton
    actionVariant="secondary"
    onClick={onClick}
    className="w-full flex flex-col items-center justify-center gap-3 h-24 rounded-3xl shadow-md shadow-black/5"
  >
    <span className={cn("inline-flex items-center justify-center")}>
      {icon}
    </span>
    <div className="text-sm font-medium text-black/50">
      {countFormatter.format(count)}개의 {label}
    </div>
  </CareerActionButton>
);

const CallHero = ({
  callDisabled,
  callStartPending,
  description,
  isOnboardingCompleted,
  onStartCall,
  title,
  extraComponent,
}: {
  callDisabled: boolean;
  callStartPending: boolean;
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
      왼쪽 채팅에서 혹은 아래 통화로 간단한 질문에만 대답해주세요.
      <br />
      대화가 끝나면 내용을 정리하고, 딱맞는 기회를 받아보실 수 있게 할게요.
    </>
  );

  const handleStartCall = () => {
    logCareerEvent("click_mobile_home_start_call");
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
        isOnboardingCompleted={isOnboardingCompleted}
        onStartCall={handleStartCall}
        title={callCardTitle}
        extraComponent={<></>}
      />

      <div className="px-1 text-center">
        <h2 className="text-black/70 font-hedvig text-[24px] font-normal">
          {displayGreetingName}
        </h2>
        <p className="mt-2 text-sm font-medium text-black/50">
          {currentTimeGreeting} 필요하신게 있다면 알려주세요.
        </p>
      </div>

      {!isOnboardingCompleted ? (
        <section className="rounded-3xl bg-beige100 px-5 py-5">
          <div className="text-[15px] font-semibold text-beige900">
            커리어 인터뷰 진행 중
          </div>
          <p className="mt-1 text-[13px] leading-5 text-beige900/60">
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
                className="!h-5 !w-5 text-black/70"
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
              <Bookmark className="!h-5 !w-5 text-black/70" strokeWidth={2.4} />
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
