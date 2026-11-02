"use client";

import React, { useCallback, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import CareerMobileShell from "../CareerMobileShell";
import CareerMobileTopBar, {
  type CareerMobileTopBarOption,
  type CareerMobileTopBarOptionId,
} from "../CareerMobileTopBar";
import type { CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";
import { HistoryOpportunityInlinePage } from "@/components/career/history/HistoryOpportunityDetailContent";
import NewOpportunityList from "@/components/career/history/NewOpportunityList";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityType,
} from "@/components/career/types";
import { useCareerT } from "@/i18n/useCareerT";
import { TabBoxes, type TabBoxItem } from "@/components/ui/tab-boxes";
import {
  getCareerOpportunityManagementStatus,
  getMyOpportunityTabs,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { CareerMobileJobsList } from "@/components/career/mobile/jobs/CareerMobileJobsList";
import type {
  JobsDisplayTab,
  JobsStatusCounts,
  JobsStatusTab,
} from "@/components/career/mobile/jobs/types";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import CareerJobLinkImportButton from "@/components/career/history/CareerJobLinkImportButton";
import { SavedOpportunityViewPicker } from "@/components/career/history/SavedOpportunityViews";

type CareerMobileJobsViewProps = {
  onChangeWorkspaceTab: (tab: CareerWorkspaceTab) => void;
  onChangeTopBarOption?: (tab: CareerMobileTopBarOptionId) => void;
  workspaceTabOptions: CareerMobileTopBarOption[];
  statusCounts: JobsStatusCounts;
  opportunities: CareerHistoryOpportunity[];
  selectedOpportunity: CareerHistoryOpportunity | null;
  internalOpportunityCount: number;
  totalOpportunityCount: number;
  onToggleOpportunity: (item: CareerHistoryOpportunity) => void;
  onApply: (item: CareerHistoryOpportunity) => void;
  onPositive: (item: CareerHistoryOpportunity) => void;
  onNegative: (item: CareerHistoryOpportunity) => void;
  onKeep: (item: CareerHistoryOpportunity) => void;
  loadingMore?: boolean;
  error?: string;
  hasMoreOpportunities?: boolean;
  onLoadMoreOpportunities?: () => void;
  pendingOpportunityIds?: Set<string>;
  profilePicture?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  profileLocation?: string | null;
  profileCurrentLocation?: string | null;
  preferredLocale?: string | null;
  onOpenSettings?: () => void;
  onOpenSupport?: () => void;
  onLogout?: () => void | Promise<void>;
  activeJobsTab?: JobsDisplayTab;
  onChangeJobsTab?: (tab: JobsDisplayTab) => void;
  bottomReservePx?: number;
  isLoading?: boolean;
  detailOpportunity?: CareerHistoryOpportunity | null;
  onCloseDetail?: () => void;
  onOpenCompanyInfo?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenChat?: () => void;
  onOpenDetail?: (opportunity: CareerHistoryOpportunity) => void;
  onOpenLink?: (
    opportunity: CareerHistoryOpportunity,
    url: string | null | undefined
  ) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onInternalDecisionAction?: (
    opportunity: CareerHistoryOpportunity,
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onStatusChange?: (
    opportunity: CareerHistoryOpportunity,
    status: CareerOpportunityManagementStatus
  ) => void;
  onUpdateTalentMemo?: (
    opportunity: CareerHistoryOpportunity,
    talentMemo: string | null
  ) => void | Promise<void>;
};

export default function CareerMobileJobsView({
  onChangeWorkspaceTab,
  onChangeTopBarOption,
  workspaceTabOptions,
  statusCounts,
  opportunities,
  selectedOpportunity,
  internalOpportunityCount,
  totalOpportunityCount,
  onToggleOpportunity,
  onApply,
  onPositive,
  onNegative,
  onKeep,
  loadingMore = false,
  error,
  hasMoreOpportunities = false,
  onLoadMoreOpportunities,
  pendingOpportunityIds,
  profilePicture,
  userName,
  userEmail,
  profileLocation,
  profileCurrentLocation,
  preferredLocale,
  onOpenSettings,
  onOpenSupport,
  onLogout,
  activeJobsTab,
  onChangeJobsTab,
  bottomReservePx = 200,
  isLoading = false,
  detailOpportunity,
  onCloseDetail,
  onOpenCompanyInfo,
  onOpenChat,
  onOpenDetail,
  onOpenLink,
  onOpenOpportunityInfo,
  onInternalDecisionAction,
  onStatusChange,
  onUpdateTalentMemo,
}: CareerMobileJobsViewProps) {
  const t = useCareerT();

  const [internalTab, setInternalTab] = useState<JobsDisplayTab>("new");
  const tab = activeJobsTab ?? internalTab;
  const setTab = onChangeJobsTab ?? setInternalTab;
  const isInboxTab = tab === "new";

  const handleTopBarChange = useCallback(
    (nextOption: CareerMobileTopBarOptionId) => {
      if (onChangeTopBarOption) {
        onChangeTopBarOption(nextOption);
        return;
      }
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
    [onChangeTopBarOption, onChangeWorkspaceTab, setTab, tab]
  );

  const statusTabItems: TabBoxItem<JobsStatusTab>[] = [
    ...getMyOpportunityTabs(t),
    {
      id: "archived" as const,
      label: t(
        "career.history.saved_opportunity_status.archived",
        "숨긴 포지션"
      ),
    },
  ].map((option) => ({
    label: option.label,
    count: statusCounts[option.id],
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
          profileLocation={profileLocation}
          profileCurrentLocation={profileCurrentLocation}
          preferredLocale={preferredLocale}
          onOpenSettings={onOpenSettings}
          onOpenSupport={onOpenSupport}
          onLogout={onLogout}
        />
      }
    >
      <div className="relative flex flex-1 flex-col">
        {!isInboxTab ? (
          <div className="sticky top-0 z-20 flex flex-col bg-transparent">
            <div className="from-bg-default from-50% to-bg-white/0 px-3 py-3">
              <TabBoxes
                activeValue={tab}
                items={statusTabItems}
                onValueChange={setTab}
                size="lg"
                variant="neutral"
                className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              />
            </div>
            {!detailOpportunity && tab === "saved" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 bg-transparent px-3 py-2">
                <SavedOpportunityViewPicker />
                <CareerJobLinkImportButton />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="relative flex flex-1 flex-col text-sm">
          {isInboxTab ? (
            <div
              className="px-3"
              style={{ paddingBottom: `${bottomReservePx}px` }}
            >
              {error ? (
                <div className="mt-4 rounded-lg border border-critical/30 bg-critical-faded px-4 py-3 text-sm text-critical">
                  {error}
                </div>
              ) : null}
              <NewOpportunityList
                expandedOpportunityId={selectedOpportunity?.id}
                hasMore={hasMoreOpportunities}
                internalCount={internalOpportunityCount}
                items={opportunities}
                loadingMore={loadingMore}
                onApply={onApply}
                onLoadMore={onLoadMoreOpportunities}
                onNegative={onNegative}
                onKeep={onKeep}
                onOpenCompanyInfo={onOpenCompanyInfo}
                onOpenLink={onOpenLink}
                onPositive={onPositive}
                onToggleOpportunity={onToggleOpportunity}
                pendingOpportunityIds={pendingOpportunityIds}
                totalCount={totalOpportunityCount}
              />
            </div>
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
                onOpenChat={onOpenChat}
                onOpenLink={(url) => onOpenLink?.(detailOpportunity, url)}
                onApply={() => onApply(detailOpportunity)}
                onInternalDecisionAction={(action) =>
                  onInternalDecisionAction?.(detailOpportunity, action)
                }
                onSavedStatusChange={(status) =>
                  onStatusChange?.(detailOpportunity, status)
                }
                onKeepDecision={(action) => {
                  if (action === "accept") onPositive(detailOpportunity);
                  else if (action === "decline") onNegative(detailOpportunity);
                }}
                onUpdateTalentMemo={onUpdateTalentMemo}
              />
            </div>
          ) : (
            <>
              {error && (
                <div
                  role="alert"
                  className="mx-3 my-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-critical"
                >
                  <span>{error}</span>
                  {opportunities.length === 0 && (
                    <MuteButton
                      size="sm"
                      disabled={isLoading}
                      onClick={onLoadMoreOpportunities}
                    >
                      {t("career.tasks.retry", "다시 불러오기")}
                    </MuteButton>
                  )}
                </div>
              )}
              {(!error || opportunities.length > 0) && (
                <CareerMobileJobsList
                  onApply={(item) =>
                    item.isInternal ? onPositive(item) : onApply(item)
                  }
                  activeTab={tab}
                  hasMore={hasMoreOpportunities}
                  isLoading={isLoading}
                  onLoadMore={onLoadMoreOpportunities}
                  onOpenCompanyInfo={onOpenCompanyInfo}
                  onOpenDetail={onOpenDetail}
                  onOpenOpportunityInfo={onOpenOpportunityInfo}
                  onInternalDecisionAction={onInternalDecisionAction}
                  onStatusChange={onStatusChange}
                  opportunities={opportunities}
                  pendingOpportunityIds={pendingOpportunityIds}
                  bottomReservePx={bottomReservePx}
                />
              )}
            </>
          )}
        </div>
      </div>
    </CareerMobileShell>
  );
}
