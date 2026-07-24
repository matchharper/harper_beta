"use client";

import { Loader2 } from "lucide-react";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityType,
} from "@/components/career/types";
import type { JobsDisplayTab } from "@/components/career/mobile/jobs/types";
import { CareerMobileJobCard } from "@/components/career/mobile/jobs/CareerMobileJobCard";
import { CareerMobileJobsEmptyState } from "@/components/career/mobile/jobs/CareerMobileJobsEmptyState";
import { CareerMobileJobsLoadingState } from "@/components/career/mobile/jobs/CareerMobileJobsLoadingState";
import { getCareerMobileJobsEmptyStateMessage } from "@/components/career/mobile/jobs/careerMobileJobsCopy";
import {
  getCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";

type CareerMobileJobsListProps = {
  activeTab: JobsDisplayTab;
  bottomReservePx: number;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore?: () => void;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenDetail?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onInternalDecisionAction?: (
    opportunity: CareerHistoryOpportunity,
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onStatusChange?: (
    opportunity: CareerHistoryOpportunity,
    status: CareerOpportunityManagementStatus
  ) => void;
  opportunities: CareerHistoryOpportunity[];
  pendingOpportunityIds?: Set<string>;
};

export function CareerMobileJobsList({
  activeTab,
  bottomReservePx,
  hasMore,
  isLoading,
  onLoadMore,
  onOpenCompanyInfo,
  onOpenDetail,
  onOpenOpportunityInfo,
  onInternalDecisionAction,
  onStatusChange,
  opportunities,
  pendingOpportunityIds,
}: CareerMobileJobsListProps) {
  const t = useCareerT();

  if (isLoading && opportunities.length === 0) {
    return <CareerMobileJobsLoadingState />;
  }

  if (opportunities.length === 0) {
    return (
      <CareerMobileJobsEmptyState>
        {getCareerMobileJobsEmptyStateMessage(activeTab, t)}
      </CareerMobileJobsEmptyState>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-3 pt-2"
      style={{ paddingBottom: `${bottomReservePx}px` }}
    >
      {opportunities.map((item) => (
        <CareerMobileJobCard
          key={item.id}
          item={item}
          pending={Boolean(pendingOpportunityIds?.has(item.id))}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onInternalDecisionAction={
            onInternalDecisionAction
              ? (action) => onInternalDecisionAction(item, action)
              : undefined
          }
          status={getCareerOpportunityManagementStatus(item)}
          onStatusChange={
            onStatusChange
              ? (status) => onStatusChange(item, status)
              : undefined
          }
          onOpenDetail={() => onOpenDetail?.(item)}
        />
      ))}

      {hasMore ? (
        <BareButton
          type="button"
          onClick={onLoadMore}
          disabled={isLoading || !onLoadMore}
          className="mt-1 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[8px] border border-neutral-1000-a10 bg-bg-floating px-4 py-3 text-[13px] font-medium text-neutral-primary transition active:bg-bg-weak disabled:opacity-55"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-neutral-muted" />
          ) : null}
          {t(
            "career.common.career_history_panel.01m9cc2",
            "더 불러올 항목이 있습니다."
          )}
        </BareButton>
      ) : null}
    </div>
  );
}
