"use client";

import Image from "next/image";
import React from "react";
import { Building2 } from "lucide-react";
import type {
  CareerHistoryOpportunity,
  CareerOpportunityType,
} from "@/components/career/types";
import { getMetaItems } from "@/components/career/CareerHistoryPanel";
import { HistoryOpportunityInfoTag } from "@/components/career/history/HistoryOpportunityDetailContent";
import { getOpportunityPostingStatus } from "@/components/career/history/opportunityPostingStatus";
import {
  canChangeCareerOpportunityManagementStatus,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import { CareerMobileJobStatusDropdown } from "@/components/career/mobile/jobs/CareerMobileJobStatusDropdown";
import { BareButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { InlinePanel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { useMessages } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { parseFundingStageLabel } from "@/lib/career/fundingStage";
import { InternalOpportunityDecisionMenu } from "@/components/career/history/InternalOpportunityDecisionActions";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import { normalizeHarperPublicImageUrl } from "@/lib/imageUrl";
import UpcomingMeetingStrip from "@/components/career/history/UpcomingMeetingStrip";

type CareerMobileJobCardProps = {
  item: CareerHistoryOpportunity;
  pending: boolean;
  status: CareerOpportunityManagementStatus;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  onInternalDecisionAction?: (
    action: CareerInternalOpportunityDecisionAction
  ) => void;
  onStatusChange?: (status: CareerOpportunityManagementStatus) => void;
};

export const CareerMobileJobCard = React.memo(function CareerMobileJobCard({
  item,
  pending,
  status,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  onInternalDecisionAction,
  onStatusChange,
}: CareerMobileJobCardProps) {
  const t = useCareerT();
  const { locale } = useMessages();
  const postingStatus = getOpportunityPostingStatus(item, locale, t, true);
  const companyInfoLink = item.companyHomepageUrl ?? item.companyLinkedinUrl;
  const companyLogoSrc = normalizeHarperPublicImageUrl(item.companyLogoUrl);
  const canChangeStatus = canChangeCareerOpportunityManagementStatus(item);
  const canOpenCompanyInfo = Boolean(
    onOpenCompanyInfo && (item.companyDbId || companyInfoLink)
  );
  const fundingStage = parseFundingStageLabel(
    item.companyData?.lastFundingStage
  );
  const detailMetaItems = getMetaItems(item, t);
  const location = formatCareerLocation(item.location, locale);

  return (
    <InlinePanel className="relative rounded-lg border border-neutral-1000-a05 bg-bg-floating py-3 px-4 transition-colors shadow-none active:bg-bg-weak">
      <div className="absolute right-2 top-2 z-10">
        {item.isInternal && onInternalDecisionAction ? (
          <InternalOpportunityDecisionMenu
            onCard
            item={item}
            pending={pending}
            onAction={onInternalDecisionAction}
          />
        ) : onStatusChange && canChangeStatus ? (
          <CareerMobileJobStatusDropdown
            disabled={pending}
            status={status}
            onChange={onStatusChange}
          />
        ) : null}
      </div>
      <ClickablePanel
        onActivate={onOpenDetail}
        className="min-w-0 cursor-pointer text-left"
      >
        <article className="min-w-0">
          <div className="w-fit">
            <div className="flex shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-floating p-1">
              {companyLogoSrc ? (
                <Image
                  src={companyLogoSrc}
                  alt={item.companyName}
                  width={28}
                  height={28}
                  className="h-7 w-7 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-neutral-00">
                  <Building2 className="h-4 w-4" />
                </div>
              )}
            </div>
          </div>
          <header className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mt-3 flex min-w-0 flex-row flex-wrap items-center justify-start gap-x-2 gap-y-1 text-[13px]">
                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1">
                  {canOpenCompanyInfo ? (
                    <BareButton
                      type="button"
                      onClick={() => onOpenCompanyInfo?.(item)}
                      className="min-w-0 wrap-break-word text-left text-[14px] font-medium text-neutral-primary decoration-dotted underline underline-offset-2 transition-colors duration-200 hover:text-primary"
                    >
                      {item.companyName}
                    </BareButton>
                  ) : (
                    <span className="min-w-0 wrap-break-word text-[14px] font-medium text-neutral-primary">
                      {item.companyName}
                    </span>
                  )}
                </div>
                {postingStatus ? (
                  <span
                    className={cn(
                      "shrink-0 text-[12px] leading-4",
                      postingStatus.isExpired
                        ? "font-medium text-info"
                        : "text-neutral-muted"
                    )}
                  >
                    {postingStatus.label}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-2 wrap-break-word text-[15px] font-medium leading-tight text-neutral-primary pr-4">
                {item.title}
              </h3>
            </div>
          </header>

          <div className="mt-3 flex w-full flex-col">
            {fundingStage || detailMetaItems.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {fundingStage ? (
                  <Badge
                    size="sm"
                    className="font-normal text-neutral-muted"
                    title={item.companyData?.lastFundingStage ?? undefined}
                  >
                    {fundingStage}
                  </Badge>
                ) : null}
                {detailMetaItems.map((meta, index) => (
                  <Badge
                    key={`${item.id}-mobile-meta-${index}`}
                    size="sm"
                    className="font-normal text-neutral-muted"
                  >
                    {meta}
                  </Badge>
                ))}
              </div>
            ) : null}
            {location || onOpenOpportunityInfo ? (
              <div className="flex min-w-0 items-center justify-between gap-3 mt-3">
                {location ? (
                  <span className="min-w-0 flex-1 wrap-break-word text-[12px] font-normal text-neutral-muted">
                    {location}
                  </span>
                ) : null}
                {onOpenOpportunityInfo ? (
                  <div className="ml-auto shrink-0">
                    <HistoryOpportunityInfoTag
                      item={item}
                      onOpenInfo={onOpenOpportunityInfo}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <UpcomingMeetingStrip
            meeting={item.upcomingMeeting}
            className="-mx-4 mt-3 rounded-none px-4"
          />
        </article>
      </ClickablePanel>
    </InlinePanel>
  );
});
