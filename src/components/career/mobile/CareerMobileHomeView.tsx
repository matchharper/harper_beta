"use client";

import React, { useMemo } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { getCareerDefaultSavedStage } from "@/components/career/opportunityTypeMeta";
import { ConversationStarterActions } from "@/components/career/ConversationStarterActions";
import type {
  CareerConversationStarterId,
  CareerConversationStarterMode,
} from "@/lib/career/conversationStarters";

const countFormatter = new Intl.NumberFormat("ko-KR");

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
  <div className="flex items-start gap-3">
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
    className="group flex w-full flex-col justify-between gap-4 rounded-2xl border border-beige900/10 bg-white px-4 py-4 text-left shadow-[0_6px_16px_rgba(46,23,6,0.05)] transition-transform active:scale-[0.99] focus:outline-none focus-visible:ring-4 focus-visible:ring-beige700/20"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-[15px] font-semibold leading-5 text-beige900">
          {title}
        </div>
        <div className="mt-1 text-[12px] font-medium leading-4 text-beige900/55">
          {status}
        </div>
      </div>
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]",
          iconClassName
        )}
      >
        {icon}
      </span>
    </div>
    <div>
      <div className="flex items-end gap-2.5">
        <span className="font-hedvig text-[32px] font-medium leading-[0.9] text-beige900">
          {countFormatter.format(count)}
        </span>
        <span className="pb-0.5 text-[12px] font-medium leading-4 text-beige900/55">
          {description}
        </span>
      </div>
      <span className="mt-3 inline-flex min-h-[32px] items-center gap-1 rounded-full border border-beige900/10 bg-beige50 px-3 text-[12px] font-normal text-beige900">
        {buttonLabel}
        <ChevronRight className="h-3 w-3" />
      </span>
    </div>
  </button>
);

const CallHero = ({
  callDisabled,
  callStartPending,
  description,
  isOnboardingCompleted,
  onStartCall,
  title,
}: {
  callDisabled: boolean;
  callStartPending: boolean;
  description: string;
  isOnboardingCompleted: boolean;
  onStartCall: () => void;
  title: string;
}) => (
  <section className="relative overflow-hidden rounded-[28px] border border-beige900/8 bg-gradient-to-b from-beige200/55 via-beige100 to-beige50 px-6 pt-9 pb-7">
    <div
      aria-hidden
      className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-beige300/30 blur-3xl"
    />

    <div className="relative flex flex-col items-center text-center">
      <div className="relative flex h-36 w-36 items-center justify-center">
        {!callStartPending ? (
          <>
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-full bg-beige700/12"
            />
            <span
              aria-hidden
              className="absolute inset-3 rounded-full bg-beige700/8"
            />
          </>
        ) : null}
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-beige200 via-beige100 to-beige50 shadow-[0_18px_40px_rgba(46,23,6,0.15)] ring-1 ring-beige900/10">
          <Phone className="h-12 w-12 text-beige700" strokeWidth={1.4} />
        </div>
      </div>

      <div className="mt-5 font-hedvig text-[26px] font-medium leading-[1.1] text-beige900">
        Harper
      </div>
      <div className="mt-1 text-[12px] font-medium uppercase tracking-[0.18em] text-beige900/45">
        {isOnboardingCompleted ? "5분 통화" : "5분 커리어 인터뷰"}
      </div>
      <p className="mt-5 max-w-[300px] text-[14px] leading-5 text-beige900/65">
        {description}
      </p>

      <button
        type="button"
        onClick={onStartCall}
        disabled={callDisabled || callStartPending}
        className="mt-8 inline-flex h-16 w-16 items-center justify-center rounded-full bg-beige700 text-beige50 shadow-[0_14px_32px_rgba(46,23,6,0.22)] transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={title}
      >
        {callStartPending ? (
          <Loader2 className="h-7 w-7 animate-spin" strokeWidth={1.6} />
        ) : (
          <Phone
            className="h-7 w-7"
            strokeWidth={1.6}
            fill="currentColor"
          />
        )}
      </button>
      <span className="mt-3 text-[13px] font-medium text-beige900/70">
        {callStartPending ? "연결 중..." : title}
      </span>
    </div>
  </section>
);

const CareerMobileHomeView = ({
  onOpenChat,
  onOpenHistory,
}: CareerMobileHomeViewProps) => {
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
      inProgressOpportunities.find(
        (opportunity) =>
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
      ? `Harper가 ${countFormatter.format(
          activeCompanyRoleCount * 2
        )}개의 기회를 스캔 중`
      : "Harper가 새 기회를 탐색 중";

  const callButtonTitle = isOnboardingCompleted
    ? "통화 시작"
    : "커리어 인터뷰 시작";

  const callDescription = isOnboardingCompleted
    ? "변경된 사항이나 요청이 있으면 통화가 가장 빠릅니다."
    : "간단한 질문에만 대답해주시면 추천을 준비할게요.";

  const handleStartCall = () => {
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
    onOpenChat();
    return onStartConversationStarter?.({ mode, starterId }) ?? false;
  };

  return (
    <div className="flex flex-col gap-6 px-4 pb-[160px] pt-4">
      <header className="px-1">
        <h2 className="font-hedvig text-[26px] font-medium leading-tight text-beige900">
          안녕하세요, <span className="text-beige700">{displayName}</span>
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-beige900/55">
          {activeOpportunityLabel}
        </p>
      </header>

      <CallHero
        callDisabled={!onStartCallMode}
        callStartPending={callStartPending}
        description={callDescription}
        isOnboardingCompleted={isOnboardingCompleted}
        onStartCall={handleStartCall}
        title={callButtonTitle}
      />

      {isOnboardingCompleted ? (
        <ConversationStarterActions
          callStartPending={callStartPending}
          disabled={!onStartConversationStarter}
          onStart={handleStartConversationStarter}
          variant="mobile"
        />
      ) : null}

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

      {isOnboardingCompleted ? (
        <section className="flex flex-col gap-3">
          <SummaryCard
            title="새 포지션"
            status="검토 대기 중"
            count={newPositionCount}
            description={newPositionDescription}
            buttonLabel="검토하기"
            icon={<Mail className="h-5 w-5 text-[#b77a4e]" strokeWidth={1.8} />}
            iconClassName="bg-[#f3ede8]"
            onClick={() =>
              onOpenHistory({ historyTab: "new", savedStage: "saved" })
            }
          />
          <SummaryCard
            title="저장 / 연결"
            status="저장함 + 연결됨"
            count={inProgressPositionCount}
            description={inProgressCompanyLabel}
            buttonLabel="상세 보기"
            icon={<Check className="h-6 w-6 text-[#4f8062]" strokeWidth={1.9} />}
            iconClassName="bg-[#e8f0eb]"
            onClick={() =>
              onOpenHistory({
                historyTab: "saved",
                savedStage: inProgressTargetSavedStage,
              })
            }
          />
        </section>
      ) : null}
    </div>
  );
};

export default React.memo(CareerMobileHomeView);
