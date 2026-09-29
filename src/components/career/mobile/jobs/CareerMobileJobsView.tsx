"use client";

import React, { useCallback, useState } from "react";
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
  getCareerOpportunityManagementStatusOptions,
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
  onPositive: (item: CareerHistoryOpportunity) => void;
  onNegative: (item: CareerHistoryOpportunity) => void;
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
  onPositive,
  onNegative,
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

  const statusTabItems: TabBoxItem<JobsStatusTab>[] =
    getCareerOpportunityManagementStatusOptions(t, {
      hiddenLabel: t(
        "career.history.saved_opportunity_status.0exoa8f",
        "보관함"
      ),
      includeArchived: true,
    }).map((option) => ({
      label: (
        <>
          {option.label}
          <span className="ml-1.5 text-[10px] font-medium tabular-nums opacity-70">
            {statusCounts[option.id]}
          </span>
        </>
      ),
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
            <div className="bg-bg-default px-3 py-2">
              <TabBoxes
                activeValue={tab}
                items={statusTabItems}
                onValueChange={setTab}
                size="xs"
                className="[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              />
            </div>
            {!detailOpportunity ? (
              <div className="flex justify-end bg-transparent px-3 py-2">
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
                onLoadMore={onLoadMoreOpportunities}
                onNegative={onNegative}
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
                onOpenOpportunityInfo={
                  onOpenOpportunityInfo ?? (() => undefined)
                }
                onInternalDecisionAction={(action) =>
                  onInternalDecisionAction?.(detailOpportunity, action)
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
              onInternalDecisionAction={onInternalDecisionAction}
              onStatusChange={onStatusChange}
              opportunities={opportunities}
              pendingOpportunityIds={pendingOpportunityIds}
              bottomReservePx={bottomReservePx}
            />
          )}
        </div>
      </div>
    </CareerMobileShell>
  );
}
