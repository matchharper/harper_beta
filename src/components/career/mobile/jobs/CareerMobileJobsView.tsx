"use client";

import React, { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Dot,
  Hand,
  Loader2,
  MapPin,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import CareerMobileShell from "../CareerMobileShell";
import CareerMobileTopBar from "../CareerMobileTopBar";
import CareerInPageTabs, {
  type CareerInPageTabItem,
} from "@/components/career/CareerInPageTabs";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import {
  getMetaItems,
  getNegativeActionLabel,
  getOpportunityPanelTone,
  getPositiveActionLabel,
} from "@/components/career/CareerHistoryPanel";
import { HistoryOpportunityInfoTag } from "@/components/career/history/HistoryOpportunityDetailContent";
import { getCareerCompanySectionTitle } from "@/components/career/opportunityTypeMeta";
import OpportunityPreferenceFit from "@/components/career/history/OpportunityPreferenceFit";
import CareerRichText from "@/components/career/ui/CareerRichText";
import type { CareerOpportunityType } from "@/components/career/types";
import { useKeyboardArrows } from "@/hooks/useKeyboardArrows";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "@/components/career/types";

export type JobsDisplayTab = "new" | "saved" | "archived" | "connected";

type WorkspaceTabOption = {
  badgeCount?: number;
  id: CareerWorkspaceTab;
  label: string;
};

type CareerMobileJobsViewProps = {
  activeWorkspaceTab: CareerWorkspaceTab;
  onChangeWorkspaceTab: (tab: CareerWorkspaceTab) => void;
  workspaceTabOptions: WorkspaceTabOption[];
  newCount?: number;
  savedCount?: number;
  archivedCount?: number;
  connectedCount?: number;
  selectedOpportunity: CareerHistoryOpportunity | null;
  selectionIndex: number;
  selectionTotal: number;
  onNavigate: (delta: -1 | 1) => void;
  profilePicture?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onLogout?: () => void | Promise<void>;
  activeJobsTab?: JobsDisplayTab;
  onChangeJobsTab?: (tab: JobsDisplayTab) => void;
  bottomReservePx?: number;
  isLoading?: boolean;
  showSwipeHint?: boolean;
  onDismissSwipeHint?: () => void;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
};

const SWIPE_THRESHOLD_PX = 40;
const FADE_DURATION = 0.18;
const MOBILE_SCROLL_CONTAINER_ID = "career-mobile-scroll";

const resetMobileScrollOnMount = (el: HTMLDivElement | null) => {
  if (!el) return;
  document
    .getElementById(MOBILE_SCROLL_CONTAINER_ID)
    ?.scrollTo({ top: 0, behavior: "auto" });
};

export default function CareerMobileJobsView({
  activeWorkspaceTab,
  onChangeWorkspaceTab,
  workspaceTabOptions,
  newCount,
  savedCount,
  archivedCount,
  connectedCount,
  selectedOpportunity,
  selectionIndex,
  selectionTotal,
  onNavigate,
  profilePicture,
  userName,
  userEmail,
  onOpenSettings,
  onOpenSupport,
  onLogout,
  activeJobsTab,
  onChangeJobsTab,
  bottomReservePx = 200,
  isLoading = false,
  showSwipeHint = false,
  onDismissSwipeHint,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
}: CareerMobileJobsViewProps) {
  const [internalTab, setInternalTab] = useState<JobsDisplayTab>("new");
  const tab = activeJobsTab ?? internalTab;
  const setTab = onChangeJobsTab ?? setInternalTab;

  const canPrev = selectionIndex > 0;
  const canNext = selectionTotal > 0 && selectionIndex < selectionTotal - 1;

  const handlePrev = useCallback(() => {
    if (canPrev) onNavigate(-1);
    onDismissSwipeHint?.();
  }, [canPrev, onNavigate, onDismissSwipeHint]);
  const handleNext = useCallback(() => {
    if (canNext) onNavigate(1);
    onDismissSwipeHint?.();
  }, [canNext, onNavigate, onDismissSwipeHint]);

  useKeyboardArrows({
    enabled: Boolean(selectedOpportunity),
    onArrowLeft: handlePrev,
    onArrowRight: handleNext,
  });

  const handleDragEnd = useCallback(
    (
      _: PointerEvent | MouseEvent | TouchEvent,
      info: { offset: { x: number; y: number }; velocity: { x: number } }
    ) => {
      const { offset, velocity } = info;
      const passedThreshold = Math.abs(offset.x) > SWIPE_THRESHOLD_PX;
      const fastEnough = Math.abs(velocity.x) > 250;
      if (!passedThreshold && !fastEnough) return;
      if (offset.x > 0) handlePrev();
      else handleNext();
    },
    [handlePrev, handleNext]
  );

  const items: CareerInPageTabItem<JobsDisplayTab>[] = [
    { id: "new", label: "새 포지션", count: newCount },
    { id: "saved", label: "저장함", count: savedCount },
    { id: "archived", label: "선호하지 않음", count: archivedCount },
    { id: "connected", label: "연결됨", count: connectedCount },
  ];

  return (
    <CareerMobileShell
      header={
        <CareerMobileTopBar
          activeTab={activeWorkspaceTab}
          options={workspaceTabOptions}
          onChangeTab={onChangeWorkspaceTab}
          profilePicture={profilePicture}
          userName={userName}
          userEmail={userEmail}
          onOpenSettings={onOpenSettings}
          onOpenSupport={onOpenSupport}
          onLogout={onLogout}
        />
      }
    >
      <div className="relative flex flex-1 flex-col">
        <CareerInPageTabs
          items={items}
          activeId={tab}
          onChange={setTab}
          mobileFloating
        />

        <div className="relative flex flex-1 flex-col text-sm">
          <AnimatePresence mode="wait" initial={false}>
            {selectedOpportunity ? (
              <motion.div
                key={selectedOpportunity.id}
                ref={resetMobileScrollOnMount}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: FADE_DURATION, ease: "easeOut" }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                dragMomentum={false}
                onDragEnd={handleDragEnd}
                className="flex flex-col px-2 pt-4"
                style={{
                  paddingBottom: `${bottomReservePx}px`,
                  touchAction: "pan-y",
                }}
              >
                <MobileOpportunityDetailPanel
                  opportunity={selectedOpportunity}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                  onOpenOpportunityInfo={onOpenOpportunityInfo}
                />
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center gap-2 px-6 py-20 text-[15px] text-beige900/55"
              >
                <Loader2 className="h-4 w-4 animate-spin text-beige900" />
                <span>저장된 정보를 불러오는 중입니다...</span>
              </motion.div>
            ) : (
              <motion.div
                key={`empty-${tab}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center px-6 py-20 text-center text-[15px] text-beige900/55"
              >
                {emptyStateMessage(tab)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {showSwipeHint && selectedOpportunity ? (
        <SwipeHintOverlay
          onDismiss={onDismissSwipeHint}
          onNavigate={onNavigate}
          canPrev={canPrev}
          canNext={canNext}
          topInsetPx={54}
          bottomInsetPx={64}
        />
      ) : null}
    </CareerMobileShell>
  );
}

function emptyStateMessage(tab: JobsDisplayTab) {
  if (tab === "new") return "아직 새로 추천된 포지션이 없습니다.";
  if (tab === "saved") return "저장한 포지션이 없습니다.";
  if (tab === "connected") return "연결된 포지션이 없습니다.";
  return "선호하지 않음으로 보낸 포지션이 없습니다.";
}

function MobileOpportunityDetailPanel({
  opportunity,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
}: {
  opportunity: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
}) {
  return (
    <section
      className={cn("rounded-2xl p-1", getOpportunityPanelTone(opportunity))}
    >
      <div className="flex w-full flex-col items-start justify-between rounded-2xl bg-beige50 px-4 py-5">
        <OpportunitySummaryCard
          opportunity={opportunity}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
        />
        <RecommendationContent opportunity={opportunity} />
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 font-inter text-[14px] font-normal text-black/80">
        <div className="space-y-3">
          <JDLinkButton opportunity={opportunity} />
          <PreferenceFitSection opportunity={opportunity} />
        </div>
        <CompanySection
          opportunity={opportunity}
          onOpenCompanyInfo={onOpenCompanyInfo}
        />
        <RoleDescriptionSection opportunity={opportunity} />
      </div>
    </section>
  );
}

function OpportunitySummaryCard({
  opportunity,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
}: {
  opportunity: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
}) {
  const postedAgo = formatRelativeTime(opportunity.postedAt);
  const metaItems = getMetaItems(opportunity);
  const companyInfoLink =
    opportunity.companyHomepageUrl ?? opportunity.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (opportunity.companyDbId || companyInfoLink)
  );
  const detailMetaItems = [
    {
      label: "location",
      value: opportunity.location,
    },
    ...metaItems.map((meta) => ({
      label: meta,
      value: meta,
    })),
  ].filter(
    (meta): meta is { label: string; value: string } =>
      typeof meta.value === "string" && meta.value.trim().length > 0
  );

  return (
    <article className="w-full">
      <header className="flex items-start gap-3">
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-beige900/10 bg-white p-1">
          {opportunity.companyLogoUrl ? (
            <Image
              src={opportunity.companyLogoUrl}
              alt={opportunity.companyName}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-beige900 text-beige100">
              <Building2 className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="wrap-break-word text-[17px] font-medium leading-tight text-black">
            {opportunity.title}
          </h2>
          <div className="mt-2 flex min-w-0 flex-row items-center justify-between gap-1 text-[13px]">
            {canOpenCompanyInfo ? (
              <button
                type="button"
                onClick={() => onOpenCompanyInfo?.(opportunity)}
                className="min-w-0 wrap-break-word text-left text-[14px] font-medium text-black/90 decoration-dotted underline underline-offset-2 transition-colors hover:text-black"
              >
                {opportunity.companyName}
              </button>
            ) : (
              <span className="min-w-0 wrap-break-word text-[14px] font-medium text-black/90">
                {opportunity.companyName}
              </span>
            )}
            {postedAgo ? (
              <span className="text-[12px] leading-4 text-black/50">
                {postedAgo}에 게시됨
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mt-3 flex w-full flex-col items-start gap-2 text-[13px] font-normal text-black/75">
        <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5">
          {detailMetaItems.map((meta, idx) => (
            <span
              key={`${opportunity.id}-detail-meta-${idx}`}
              className="inline-flex min-w-0 items-center gap-x-1"
            >
              {meta.label === "location" ? (
                <MapPin className="h-3.5 w-3.5 shrink-0 text-black/50" />
              ) : (
                <span className="shrink-0 text-black/35">·</span>
              )}
              <span className="min-w-0 wrap-break-word">{meta.value}</span>
            </span>
          ))}
        </div>
        {onOpenOpportunityInfo ? (
          <HistoryOpportunityInfoTag
            item={opportunity}
            onOpenInfo={(type) => onOpenOpportunityInfo(type)}
          />
        ) : null}
      </div>
    </article>
  );
}

function RecommendationContent({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const summary = opportunity.recommendationSummary?.trim();
  const concerns = opportunity.recommendationConcerns ?? [];
  const hasContent =
    Boolean(summary) ||
    opportunity.recommendationReasons.length > 0 ||
    concerns.length > 0;

  if (!hasContent) return null;

  return (
    <div className="mt-6 flex flex-col gap-2.5 text-[13px] leading-6 text-black/80">
      {summary ? <div>{summary}</div> : null}
      {opportunity.recommendationReasons.map((reason, idx) => (
        <div
          key={`${opportunity.id}-reason-${idx}`}
          className="flex w-full items-start justify-start gap-1"
        >
          <Dot className="mt-0.5 h-4 w-4 min-w-4 text-black/35" />
          <div
            className="min-w-0 flex-1"
            dangerouslySetInnerHTML={{ __html: reason }}
          />
        </div>
      ))}
      {concerns.map((concern, idx) => (
        <div
          key={`${opportunity.id}-concern-${idx}`}
          className="flex w-full items-start justify-start gap-1"
        >
          <Dot className="mt-0.5 h-4 w-4 min-w-4 text-black/35" />
          <div className="min-w-0 flex-1">불안 요소 : {concern}</div>
        </div>
      ))}
    </div>
  );
}

function JDLinkButton({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const logCareerEvent = useCareerLogEvent();
  const roleLink = opportunity.href;
  if (!roleLink) return null;
  return (
    <a
      href={roleLink}
      target="_blank"
      rel="noreferrer"
      onClick={() => logCareerEvent("click_mobile_history_open_jd")}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-beige900 px-4 py-3 text-sm font-semibold text-beige50 transition-opacity active:opacity-90"
    >
      JD 확인하기
      <ArrowUpRight className="h-4 w-4" />
    </a>
  );
}

function PreferenceFitSection({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const items = opportunity.preferenceFit;
  if (!items || items.length === 0) return null;
  return <OpportunityPreferenceFit items={items} variant="detail" />;
}

function CompanySection({
  opportunity,
  onOpenCompanyInfo,
}: {
  opportunity: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
}) {
  const sectionTitle = getCareerCompanySectionTitle(
    opportunity.opportunityType
  );
  const companyInfoLink =
    opportunity.companyHomepageUrl ?? opportunity.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (opportunity.companyDbId || companyInfoLink)
  );
  const actionLabel = opportunity.companyDbId ? "회사 정보" : "링크 열기";

  return (
    <section className="space-y-2">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-medium leading-5 text-beige900">
          <Building2 className="h-4 w-4" />
          <span>{sectionTitle}</span>
        </div>
        {canOpenCompanyInfo ? (
          <button
            type="button"
            onClick={() => onOpenCompanyInfo?.(opportunity)}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-beige900/60 decoration-dotted underline underline-offset-2 transition-colors hover:text-beige900/80"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="h-px w-full bg-beige900/10" />
      <div className="text-sm leading-6">
        {opportunity.companyDescription?.trim() || "아직 회사 설명이 없습니다."}
      </div>
    </section>
  );
}

function RoleDescriptionSection({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[14px] font-medium leading-5 text-beige900">
        <span>역할 설명</span>
      </h3>
      <div className="h-px w-full bg-beige900/10" />
      {opportunity.description?.trim() ? (
        <CareerRichText content={opportunity.description} />
      ) : (
        <div className="text-sm leading-6">
          아직 상세 역할 설명이 정리되지 않았습니다.
        </div>
      )}
    </section>
  );
}

export function JobActionBar({
  opportunity,
  onTrack,
  onDismiss,
  className,
}: {
  opportunity: CareerHistoryOpportunity | null;
  onTrack?: () => void;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!opportunity) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <button
        type="button"
        onClick={onDismiss}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-beige900/15 bg-white text-[13px] font-normal text-beige900/85 transition active:bg-beige100"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        {getNegativeActionLabel(opportunity)}
      </button>
      <button
        type="button"
        onClick={onTrack}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-beige900 text-[13px] font-normal text-beige50 transition active:bg-beige900/85"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {getPositiveActionLabel(opportunity)}
      </button>
    </div>
  );
}

function SwipeHintOverlay({
  onDismiss,
  onNavigate,
  canPrev,
  canNext,
  topInsetPx = 0,
  bottomInsetPx = 0,
}: {
  onDismiss?: () => void;
  onNavigate?: (delta: -1 | 1) => void;
  canPrev?: boolean;
  canNext?: boolean;
  topInsetPx?: number;
  bottomInsetPx?: number;
}) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    startRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      onDismiss?.();
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && canPrev) onNavigate?.(-1);
      else if (dx < 0 && canNext) onNavigate?.(1);
    }
    onDismiss?.();
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onDismiss}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onDismiss?.();
        }
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed left-0 right-0 z-40 flex flex-col items-center justify-center gap-4 bg-beige900/45 backdrop-blur-[1px]"
      style={{
        top: `calc(env(safe-area-inset-top) + ${topInsetPx}px)`,
        bottom: `calc(env(safe-area-inset-bottom) + ${bottomInsetPx}px)`,
      }}
    >
      <div className="flex items-center gap-6 text-beige50">
        <motion.div
          animate={{ x: [0, -10, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowLeft className="h-9 w-9" strokeWidth={2.5} />
        </motion.div>
        <Hand className="h-12 w-12" strokeWidth={2.0} />
        <motion.div
          animate={{ x: [0, 10, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <ArrowRight className="h-9 w-9" strokeWidth={2.5} />
        </motion.div>
      </div>
      <p className="text-[14px] font-medium text-beige50">좌우로 넘겨 보세요</p>
    </motion.div>
  );
}
