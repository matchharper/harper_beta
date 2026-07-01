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
  MapPin,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import CareerMobileShell from "../CareerMobileShell";
import CareerMobileTopBar, {
  type CareerMobileTopBarOption,
  type CareerMobileTopBarOptionId,
} from "../CareerMobileTopBar";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import {
  getMetaItems,
  getNegativeActionLabel,
  getOpportunityPanelTone,
  getPositiveActionLabel,
} from "@/components/career/CareerHistoryPanel";
import {
  HistoryOpportunityInfoTag,
  HistoryOpportunityInlinePage,
} from "@/components/career/history/HistoryOpportunityDetailContent";
import { getCareerCompanySectionTitle } from "@/components/career/opportunityTypeMeta";
import RichText from "@/components/ui/rich-text";
import type { CareerOpportunityType } from "@/components/career/types";
import { useKeyboardArrows } from "@/hooks/useKeyboardArrows";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { getOpportunityPostingStatus } from "@/components/career/history/opportunityPostingStatus";
import { BareButton } from "@/components/ui/button";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import {
  getCareerOpportunityManagementStatus,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { CareerMobileJobsList } from "@/components/career/mobile/jobs/CareerMobileJobsList";
import { getCareerMobileJobsEmptyStateMessage } from "@/components/career/mobile/jobs/careerMobileJobsCopy";
import { CareerMobileJobsEmptyState } from "@/components/career/mobile/jobs/CareerMobileJobsEmptyState";
import { CareerMobileJobsLoadingState } from "@/components/career/mobile/jobs/CareerMobileJobsLoadingState";
import type {
  JobsDisplayTab,
  JobsStatusCounts,
  JobsStatusTab,
} from "@/components/career/mobile/jobs/types";

type CareerMobileJobsViewProps = {
  onChangeWorkspaceTab: (tab: CareerWorkspaceTab) => void;
  workspaceTabOptions: CareerMobileTopBarOption[];
  statusCounts: JobsStatusCounts;
  opportunities: CareerHistoryOpportunity[];
  selectedOpportunity: CareerHistoryOpportunity | null;
  selectionIndex: number;
  selectionTotal: number;
  onNavigate: (delta: -1 | 1) => void;
  hasMoreOpportunities?: boolean;
  onLoadMoreOpportunities?: () => void;
  pendingOpportunityIds?: Set<string>;
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
  detailOpportunity?: CareerHistoryOpportunity | null;
  onCloseDetail?: () => void;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenDetail?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenLink?: (
    opportunity: CareerHistoryOpportunity,
    url: string | null | undefined
  ) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onStatusChange?: (
    opportunity: CareerHistoryOpportunity,
    status: CareerOpportunityManagementStatus
  ) => void;
  onUpdateTalentMemo?: (
    opportunity: CareerHistoryOpportunity,
    talentMemo: string | null
  ) => void | Promise<void>;
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
  onChangeWorkspaceTab,
  workspaceTabOptions,
  statusCounts,
  opportunities,
  selectedOpportunity,
  selectionIndex,
  selectionTotal,
  onNavigate,
  hasMoreOpportunities = false,
  onLoadMoreOpportunities,
  pendingOpportunityIds,
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
  detailOpportunity,
  onCloseDetail,
  onOpenCompanyInfo,
  onOpenDetail,
  onOpenLink,
  onOpenOpportunityInfo,
  onStatusChange,
  onUpdateTalentMemo,
}: CareerMobileJobsViewProps) {
  const t = useCareerT();

  const [internalTab, setInternalTab] = useState<JobsDisplayTab>("new");
  const tab = activeJobsTab ?? internalTab;
  const setTab = onChangeJobsTab ?? setInternalTab;
  const isInboxTab = tab === "new";

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
    enabled: isInboxTab && Boolean(selectedOpportunity),
    onArrowLeft: handlePrev,
    onArrowRight: handleNext,
  });

  const handleTopBarChange = useCallback(
    (nextOption: CareerMobileTopBarOptionId) => {
      if (nextOption === "inbox") {
        setTab("new");
        return;
      }

      if (nextOption === "jobs") {
        setTab(tab === "new" ? "saved" : tab);
        return;
      }

      onChangeWorkspaceTab(nextOption);
    },
    [onChangeWorkspaceTab, setTab, tab]
  );

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

  const statusTabItems: TabBoxItem<JobsStatusTab>[] =
    getCareerOpportunityManagementStatusOptions(t, {
      hiddenLabel: t(
        "career.history.saved_opportunity_status.0exoa8f",
        "보관함"
      ),
      includeArchived: true,
    })
      .map((option) => ({
        // count: statusCounts[option.id],
        label: option.label,
        value: option.id,
      }));

  return (
    <CareerMobileShell
      header={
        <CareerMobileTopBar
          activeTab={isInboxTab ? "inbox" : "jobs"}
          options={workspaceTabOptions}
          onChangeTab={handleTopBarChange}
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
        {!isInboxTab ? (
          <div className="sticky top-0 z-20 bg-bg-basement px-3 py-2">
            <TabBoxes
              activeValue={tab}
              items={statusTabItems}
              onValueChange={setTab}
              size="xs"
              className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            />
          </div>
        ) : null}

        <div className="relative flex flex-1 flex-col text-sm">
          {isInboxTab ? (
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
                <CareerMobileJobsLoadingState />
              ) : (
                <CareerMobileJobsEmptyState>
                  {getCareerMobileJobsEmptyStateMessage(tab, t)}
                </CareerMobileJobsEmptyState>
              )}
            </AnimatePresence>
          ) : detailOpportunity ? (
            <div
              className="px-3 pt-3"
              style={{ paddingBottom: `${bottomReservePx}px` }}
            >
              <HistoryOpportunityInlinePage
                item={detailOpportunity}
                pending={Boolean(
                  pendingOpportunityIds?.has(detailOpportunity.id)
                )}
                savedStatus={getCareerOpportunityManagementStatus(
                  detailOpportunity
                )}
                onBack={onCloseDetail ?? (() => undefined)}
                onOpenCompanyInfo={onOpenCompanyInfo}
                onOpenLink={(url) => onOpenLink?.(detailOpportunity, url)}
                onOpenOpportunityInfo={
                  onOpenOpportunityInfo ?? (() => undefined)
                }
                onSavedStatusChange={(status) =>
                  onStatusChange?.(detailOpportunity, status)
                }
                onUpdateTalentMemo={onUpdateTalentMemo}
              />
            </div>
          ) : (
            <CareerMobileJobsList
              activeTab={tab}
              hasMore={hasMoreOpportunities}
              isLoading={isLoading}
              onLoadMore={onLoadMoreOpportunities}
              onOpenCompanyInfo={onOpenCompanyInfo}
              onOpenDetail={onOpenDetail}
              onOpenOpportunityInfo={onOpenOpportunityInfo}
              onStatusChange={onStatusChange}
              opportunities={opportunities}
              pendingOpportunityIds={pendingOpportunityIds}
              bottomReservePx={bottomReservePx}
            />
          )}
        </div>
      </div>
      {showSwipeHint && isInboxTab && selectedOpportunity ? (
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
      <div className="flex w-full flex-col items-start justify-between rounded-xl bg-bg-floating px-3 py-3">
        <OpportunitySummaryCard
          opportunity={opportunity}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
        />
        <RecommendationContent
          opportunity={opportunity}
          showTalentMemo={false}
        />
      </div>

      <div className="flex flex-col gap-6 px-4 py-4 font-inter text-[14px] font-normal text-neutral-primary">
        <div className="space-y-3">
          <JDLinkButton opportunity={opportunity} />
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
  const t = useCareerT();
  const { locale } = useMessages();
  const postingStatus = getOpportunityPostingStatus(opportunity, locale, t);
  const metaItems = getMetaItems(opportunity, t);
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
      <div className="flex items-end justify-start w-full mb-4">
        <div className="w-fit">
          {onOpenOpportunityInfo && (
            <HistoryOpportunityInfoTag
              item={opportunity}
              onOpenInfo={onOpenOpportunityInfo}
            />
          )}
        </div>
      </div>
      <header className="flex items-start gap-3">
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating p-1">
          {opportunity.companyLogoUrl ? (
            <Image
              src={opportunity.companyLogoUrl}
              alt={opportunity.companyName}
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-neutral-00">
              <Building2 className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="wrap-break-word text-[16px] font-medium leading-tight text-neutral-primary">
            {opportunity.title}
          </h2>
          <div className="mt-2 flex min-w-0 flex-row items-center justify-between gap-1 text-[13px]">
            {canOpenCompanyInfo ? (
              <BareButton
                type="button"
                onClick={() => onOpenCompanyInfo?.(opportunity)}
                className="min-w-0 wrap-break-word text-left text-[14px] font-medium text-neutral-primary decoration-dotted underline underline-offset-2 transition-colors duration-200 hover:text-primary"
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
  const t = useCareerT();

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
    <div className="mt-6 flex flex-col gap-2.5 text-[14px] leading-[1.7] text-neutral-primary">
      {summary ? <div>{summary}</div> : null}
      {showTalentMemo && talentMemo ? (
        <div className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 py-2 shadow-sm">
          <div className="text-[12px] font-medium text-neutral-soft">
            {t("career.history.career_mobile_jobs_view.1gufjot", "내 메모")}
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
          <div className="min-w-0 flex-1">
            {t("career.common.career.0z5xpdx", "지원전 검토 사항")} {concern}
          </div>
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
  const t = useCareerT();

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
      {t("career.common.career.0wohsg4", "JD 확인하기")}
      <ArrowUpRight className="h-4 w-4" />
    </a>
  );
}

function CompanySection({
  opportunity,
  onOpenCompanyInfo,
}: {
  opportunity: CareerHistoryOpportunity;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
}) {
  const t = useCareerT();
  const sectionTitle = getCareerCompanySectionTitle(
    opportunity.opportunityType,
    t
  );
  const companyInfoLink =
    opportunity.companyHomepageUrl ?? opportunity.companyLinkedinUrl;
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (opportunity.companyDbId || companyInfoLink)
  );
  const actionLabel = opportunity.companyDbId
    ? t("career.common.career.0ol21b2", "회사 정보")
    : t("career.common.career.09c4j2c", "링크 열기");

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
            className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-neutral-muted underline underline-offset-4 transition-colors duration-200 hover:text-primary"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            {actionLabel}
          </BareButton>
        ) : null}
      </div>
      <div className="h-px w-full bg-neutral-1000-a05" />
      <div className="text-sm leading-6">
        {opportunity.companyDescription?.trim() ||
          t("career.common.career.083cky2", "아직 회사 설명이 없습니다.")}
      </div>
    </section>
  );
}

function RoleDescriptionSection({
  opportunity,
}: {
  opportunity: CareerHistoryOpportunity;
}) {
  const t = useCareerT();

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-[14px] font-medium leading-5 text-neutral-primary">
        <span>{t("career.common.career.0f24yir", "역할 설명")}</span>
      </h3>
      <div className="h-px w-full bg-neutral-1000-a05" />
      {opportunity.description?.trim() ? (
        <RichText content={opportunity.description} />
      ) : (
        <div className="text-sm leading-6">
          {t(
            "career.common.career.1ugn5p7",
            "아직 상세 역할 설명이 정리되지 않았습니다."
          )}
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
  const t = useCareerT();

  if (!opportunity) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <BareButton
        type="button"
        onClick={onDismiss}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating text-[13px] font-normal text-neutral-primary/85 transition active:bg-bg-weak"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
        {getNegativeActionLabel(opportunity, t)}
      </BareButton>
      <BareButton
        type="button"
        onClick={onTrack}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-black text-[13px] font-normal text-neutral-00 transition active:bg-black/85"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
        {getPositiveActionLabel(opportunity, t)}
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
  const t = useCareerT();

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
        {t(
          "career.history.career_mobile_jobs_view.0ujd7dh",
          "좌우로 넘겨 보세요"
        )}
      </p>
    </motion.button>
  );
}
