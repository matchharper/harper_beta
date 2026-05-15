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
  Globe,
  Hand,
  Loader2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import CareerMobileShell from "../CareerMobileShell";
import CareerMobileTopBar from "../CareerMobileTopBar";
import CareerMobileSegmentedTabs, {
  type SegmentedTabItem,
} from "../CareerMobileSegmentedTabs";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import {
  getMetaItems,
  getNegativeActionLabel,
  getPositiveActionLabel,
} from "@/components/career/CareerHistoryPanel";
import { HistoryOpportunityInfoTag } from "@/components/career/history/HistoryOpportunityDetailContent";
import { getCareerCompanySectionTitle } from "@/components/career/opportunityTypeMeta";
import OpportunityPreferenceFit from "@/components/career/history/OpportunityPreferenceFit";
import CareerRichText from "@/components/career/ui/CareerRichText";
import type { CareerOpportunityType } from "@/components/career/types";
import { useKeyboardArrows } from "@/hooks/useKeyboardArrows";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "@/components/career/types";

export type JobsDisplayTab = "new" | "tracking" | "archived";

type WorkspaceTabOption = {
  id: CareerWorkspaceTab;
  label: string;
};

type CareerMobileJobsViewProps = {
  activeWorkspaceTab: CareerWorkspaceTab;
  onChangeWorkspaceTab: (tab: CareerWorkspaceTab) => void;
  workspaceTabOptions: WorkspaceTabOption[];
  newCount?: number;
  trackingCount?: number;
  archivedCount?: number;
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
  trackingCount,
  archivedCount,
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

  const items: SegmentedTabItem<JobsDisplayTab>[] = [
    { id: "new", label: "New", count: newCount },
    { id: "tracking", label: "Tracking", count: trackingCount },
    { id: "archived", label: "Archived", count: archivedCount },
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
        <CareerMobileSegmentedTabs
          items={items}
          activeId={tab}
          onChange={setTab}
          className="sticky top-0 z-20"
        />

        <div className="relative flex flex-1 flex-col">
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
                className="flex flex-col gap-5 px-4 pt-4"
                style={{
                  paddingBottom: `${bottomReservePx}px`,
                  touchAction: "pan-y",
                }}
              >
                <OpportunitySummaryCard
                  opportunity={selectedOpportunity}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                  onOpenOpportunityInfo={onOpenOpportunityInfo}
                />
                <RecommendationSummary opportunity={selectedOpportunity} />
                <RecommendationConcerns opportunity={selectedOpportunity} />
                <JDLinkButton opportunity={selectedOpportunity} />
                <PreferenceFitSection opportunity={selectedOpportunity} />
                <CompanySection
                  opportunity={selectedOpportunity}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                />
                <RoleDescriptionSection opportunity={selectedOpportunity} />
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
          topInsetPx={64}
          bottomInsetPx={64}
        />
      ) : null}
    </CareerMobileShell>
  );
}

function emptyStateMessage(tab: JobsDisplayTab) {
  if (tab === "new") return "아직 새로 추천된 포지션이 없습니다.";
  if (tab === "tracking") return "트래킹 중인 포지션이 없습니다.";
  return "보관된 포지션이 없습니다.";
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
  const sourceLabel =
    opportunity.sourceType === "external"
      ? opportunity.sourceProvider?.trim() || "Web-sourced"
      : "Internal";
  const companyInfoLink =
    opportunity.companyHomepageUrl ?? opportunity.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (opportunity.companyDbId || companyInfoLink)
  );

  return (
    <article className="border border-beige900/10 bg-white p-5">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-beige900 text-beige50/80">
          {opportunity.companyLogoUrl ? (
            <Image
              src={opportunity.companyLogoUrl}
              alt={opportunity.companyName}
              width={48}
              height={48}
              className="h-12 w-12 object-cover"
            />
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide">
              {opportunity.companyName.slice(0, 2)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-medium leading-tight text-beige900">
            {opportunity.title}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] text-beige900/70">
            {canOpenCompanyInfo ? (
              <button
                type="button"
                onClick={() => onOpenCompanyInfo?.(opportunity)}
                className="min-w-0 wrap-break-word text-left decoration-dotted underline underline-offset-2 transition-colors hover:text-beige900"
              >
                {opportunity.companyName}
              </button>
            ) : (
              <span>{opportunity.companyName}</span>
            )}
            {opportunity.location ? (
              <>
                <Sep />
                <span>{opportunity.location}</span>
              </>
            ) : null}
            {metaItems.map((meta, idx) => (
              <React.Fragment key={`${opportunity.id}-meta-${idx}`}>
                <Sep />
                <span>{meta}</span>
              </React.Fragment>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-beige900/55">
            {postedAgo ? <span>{postedAgo}에 게시됨</span> : null}
            {postedAgo ? <Sep /> : null}
            <Globe className="h-3.5 w-3.5" />
            <span className="underline underline-offset-[3px]">
              {sourceLabel}
            </span>
          </div>
          <div className="mt-3">
            <HistoryOpportunityInfoTag
              item={opportunity}
              onOpenInfo={(type) => onOpenOpportunityInfo?.(type)}
            />
          </div>
        </div>
      </header>

      {opportunity.recommendationReasons.length > 0 ? (
        <ul className="mt-5 space-y-2.5 text-[15px] leading-[1.55] text-beige900">
          {opportunity.recommendationReasons.map((reason, idx) => (
            <li
              key={`${opportunity.id}-reason-${idx}`}
              className="relative flex items-start gap-2"
            >
              <Dot className="mt-0.5 h-5 w-5 shrink-0 text-beige900" />
              <span
                className="flex-1"
                dangerouslySetInnerHTML={{ __html: reason }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function RecommendationSummary({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const summary = opportunity.recommendationSummary?.trim();
  if (!summary) return null;
  return (
    <div className="rounded-[6px] border border-beige900/10 bg-white/65 px-4 py-3 text-[14px] leading-6 text-beige900/90">
      {summary}
    </div>
  );
}

function RecommendationConcerns({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const concerns = opportunity.recommendationConcerns ?? [];
  if (concerns.length === 0) return null;
  return (
    <ul className="space-y-2">
      {concerns.map((concern, idx) => (
        <li
          key={`${opportunity.id}-concern-${idx}`}
          className="flex items-start gap-1 text-[14px] leading-6 text-beige900/80"
        >
          <Dot className="mt-0.5 h-5 w-5 shrink-0 text-[#9a7b39]" />
          <span>불안 요소 : {concern}</span>
        </li>
      ))}
    </ul>
  );
}

function JDLinkButton({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const roleLink = opportunity.href;
  if (!roleLink) return null;
  return (
    <a
      href={roleLink}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-12 items-center justify-center gap-2 rounded-[8px] border border-beige900 bg-beige900 px-4 text-[15px] font-medium text-beige50"
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
  const sectionTitle = getCareerCompanySectionTitle(opportunity.opportunityType);
  const companyInfoLink =
    opportunity.companyHomepageUrl ?? opportunity.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (opportunity.companyDbId || companyInfoLink)
  );
  const actionLabel = opportunity.companyDbId ? "회사 정보" : "링크 열기";

  return (
    <section>
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[15px] font-medium text-beige900">
          <Building2 className="h-4 w-4" />
          <span>{sectionTitle}</span>
        </div>
        {canOpenCompanyInfo ? (
          <button
            type="button"
            onClick={() => onOpenCompanyInfo?.(opportunity)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-beige900/70 decoration-dotted underline underline-offset-2 transition-colors hover:text-beige900"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <hr className="mt-3 border-beige900/10" />
      <div className="mt-3 text-[14px] leading-6 text-beige900/85">
        {opportunity.companyDescription?.trim() ||
          "아직 회사 설명이 없습니다."}
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
    <section>
      <h3 className="text-[15px] font-medium text-beige900">역할 설명</h3>
      <hr className="mt-3 border-beige900/10" />
      {opportunity.description?.trim() ? (
        <CareerRichText content={opportunity.description} className="mt-3" />
      ) : (
        <div className="mt-3 text-[14px] leading-6 text-beige900/60">
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
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-beige900/15 bg-white text-[15px] font-medium text-beige900/85 transition active:bg-beige100"
      >
        <ThumbsDown className="h-4 w-4" />
        {getNegativeActionLabel(opportunity)}
      </button>
      <button
        type="button"
        onClick={onTrack}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-beige900 text-[15px] font-medium text-beige50 transition active:bg-beige900/85"
      >
        <ThumbsUp className="h-4 w-4" />
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

function Sep() {
  return (
    <span className="select-none text-beige900/35" aria-hidden>
      ·
    </span>
  );
}
