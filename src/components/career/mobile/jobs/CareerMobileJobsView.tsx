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
  StickyNote,
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
import RichText from "@/components/ui/rich-text";
import type { CareerOpportunityType } from "@/components/career/types";
import { useKeyboardArrows } from "@/hooks/useKeyboardArrows";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { getOpportunityPostingStatus } from "@/components/career/history/opportunityPostingStatus";
import { BareButton } from "@/components/ui/button";

export type JobsDisplayTab = "new" | "saved" | "archived";

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
  onEditMemo?: (opportunity: CareerHistoryOpportunity) => void;
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
  onEditMemo,
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
                  onEditMemo={tab === "new" ? undefined : onEditMemo}
                />
              </motion.div>
            ) : isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center gap-2 px-6 py-20 text-[15px] text-neutral-muted"
              >
                <Loader2 className="h-4 w-4 animate-spin text-neutral-primary" />
                <span>저장된 정보를 불러오는 중입니다...</span>
              </motion.div>
            ) : (
              <motion.div
                key={`empty-${tab}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 items-center justify-center px-6 py-20 text-center text-[15px] text-neutral-muted"
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
  return "선호하지 않음으로 보낸 포지션이 없습니다.";
}

function MobileOpportunityDetailPanel({
  opportunity,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  onEditMemo,
}: {
  opportunity: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onEditMemo?: (opportunity: CareerHistoryOpportunity) => void;
}) {
  const talentMemo = opportunity.talentMemo?.trim() ?? "";

  return (
    <section
      className={cn("rounded-2xl p-1", getOpportunityPanelTone(opportunity))}
    >
      <div className="flex w-full flex-col items-start justify-between rounded-2xl bg-bg-floating px-4 py-5">
        <OpportunitySummaryCard
          opportunity={opportunity}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
        />
        {onEditMemo ? (
          <BareButton
            type="button"
            onClick={() => onEditMemo(opportunity)}
            className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm font-medium text-neutral-primary"
          >
            <StickyNote className="h-4 w-4" />
            {talentMemo ? "메모 수정" : "메모하기"}
          </BareButton>
        ) : null}
        <RecommendationContent
          opportunity={opportunity}
          showTalentMemo={Boolean(onEditMemo)}
        />
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 font-inter text-[14px] font-normal text-neutral-primary">
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
  const postingStatus = getOpportunityPostingStatus(opportunity);
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
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating p-1">
          {opportunity.companyLogoUrl ? (
            <Image
              src={opportunity.companyLogoUrl}
              alt={opportunity.companyName}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-neutral-00">
              <Building2 className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="wrap-break-word text-[17px] font-medium leading-tight text-neutral-primary">
            {opportunity.title}
          </h2>
          <div className="mt-2 flex min-w-0 flex-row items-center justify-between gap-1 text-[13px]">
            {canOpenCompanyInfo ? (
              <BareButton
                type="button"
                onClick={() => onOpenCompanyInfo?.(opportunity)}
                className="min-w-0 wrap-break-word text-left text-[14px] font-medium text-neutral-primary decoration-dotted underline underline-offset-2 transition-colors hover:text-neutral-primary"
              >
                {opportunity.companyName}
              </BareButton>
            ) : (
              <span className="min-w-0 wrap-break-word text-[14px] font-medium text-neutral-primary">
                {opportunity.companyName}
              </span>
            )}
            {postingStatus ? (
              <span
                className={cn(
                  "text-[12px] leading-4",
                  postingStatus.isExpired
                    ? "font-medium text-info"
                    : "text-neutral-muted"
                )}
              >
                {postingStatus.label}
              </span>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mt-3 flex w-full flex-col items-start gap-2 text-[13px] font-normal text-neutral-muted">
        <div className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5">
          {detailMetaItems.map((meta, idx) => (
            <span
              key={`${opportunity.id}-detail-meta-${idx}`}
              className="inline-flex min-w-0 items-center gap-x-1"
            >
              {meta.label === "location" ? (
                <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-muted" />
              ) : (
                <span className="shrink-0 text-neutral-soft">·</span>
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
  showTalentMemo = false,
}: {
  opportunity: CareerHistoryOpportunity;
  showTalentMemo?: boolean;
}) {
  const summary = opportunity.recommendationSummary?.trim();
  const concerns = opportunity.recommendationConcerns ?? [];
  const talentMemo = opportunity.talentMemo?.trim() ?? "";
  const hasContent =
    Boolean(summary) ||
    opportunity.recommendationReasons.length > 0 ||
    concerns.length > 0 ||
    (showTalentMemo && Boolean(talentMemo));

  if (!hasContent) return null;

  return (
    <div className="mt-6 flex flex-col gap-2.5 text-[15px] leading-[1.7] text-neutral-primary">
      {summary ? <div>{summary}</div> : null}
      {showTalentMemo && talentMemo ? (
        <div className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 py-2 shadow-sm">
          <div className="text-[12px] font-medium text-neutral-soft">
            내 메모
          </div>
          <div className="mt-1 whitespace-pre-wrap text-[13px] text-neutral-primary">
            {talentMemo}
          </div>
        </div>
      ) : null}
      {opportunity.recommendationReasons.map((reason, idx) => (
        <div
          key={`${opportunity.id}-reason-${idx}`}
          className="flex w-full items-start justify-start gap-1"
        >
          <Dot className="mt-0.5 h-4 w-4 min-w-4 text-neutral-soft" />
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
          <Dot className="mt-0.5 h-4 w-4 min-w-4 text-neutral-soft" />
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
      onClick={() =>
        logCareerEvent(
          "click_mobile_history_open_jd",
          opportunity.companyDbId != null
            ? { companyId: opportunity.companyDbId }
            : undefined
        )
      }
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-black px-4 py-3 text-sm font-semibold text-neutral-00 transition-opacity active:opacity-90"
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
        <div className="flex items-center gap-2 text-[14px] font-medium text-neutral-primary">
          <Building2 className="h-4 w-4" />
          <span>{sectionTitle}</span>
        </div>
        {canOpenCompanyInfo ? (
          <BareButton
            type="button"
            onClick={() => onOpenCompanyInfo?.(opportunity)}
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-neutral-muted decoration-dotted underline underline-offset-2 transition-colors hover:text-neutral-muted"
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </BareButton>
        ) : null}
      </div>
      <div className="h-px w-full bg-neutral-1000-a05" />
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
      <h3 className="flex items-center gap-2 text-[14px] font-medium leading-5 text-neutral-primary">
        <span>역할 설명</span>
      </h3>
      <div className="h-px w-full bg-neutral-1000-a05" />
      {opportunity.description?.trim() ? (
        <RichText content={opportunity.description} />
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
      <BareButton
        type="button"
        onClick={onDismiss}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating text-[13px] font-normal text-neutral-primary/85 transition active:bg-bg-weak"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        {getNegativeActionLabel(opportunity)}
      </BareButton>
      <BareButton
        type="button"
        onClick={onTrack}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-black text-[13px] font-normal text-neutral-00 transition active:bg-black/85"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {getPositiveActionLabel(opportunity)}
      </BareButton>
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

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (event: React.TouchEvent<HTMLButtonElement>) => {
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
    <motion.button
      type="button"
      onClick={onDismiss}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed left-0 right-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/45 backdrop-blur-[1px]"
      style={{
        top: `calc(env(safe-area-inset-top) + ${topInsetPx}px)`,
        bottom: `calc(env(safe-area-inset-bottom) + ${bottomInsetPx}px)`,
      }}
    >
      <div className="flex items-center gap-6 text-neutral-00">
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
      <p className="text-[14px] font-medium text-neutral-00">
        좌우로 넘겨 보세요
      </p>
    </motion.button>
  );
}
