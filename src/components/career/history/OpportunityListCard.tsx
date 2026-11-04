import React from "react";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import { InlinePanel } from "@/components/ui/panel";
import { Building2, EllipsisVertical, Loader2 } from "lucide-react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import {
  canChangeCareerOpportunityManagementStatus,
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { InternalOpportunityDecisionMenu } from "./InternalOpportunityDecisionActions";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import { useMessages } from "@/i18n/useMessage";
import { cn, formatRelativeTime } from "@/lib/utils";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import {
  isCareerHistoryOpportunityExpired,
  getOpportunityDeadlineLabel,
} from "./opportunityPostingStatus";
import UpcomingMeetingStrip from "./UpcomingMeetingStrip";
import ProgressOpportunityRow from "./ProgressOpportunityRow";

const stopCardActivation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const SavedManagementStatusDropdown = ({
  disabled,
  status,
  onChange,
}: {
  disabled: boolean;
  status: CareerOpportunityManagementStatus;
  onChange: (value: CareerOpportunityManagementStatus) => void;
}) => {
  const t = useCareerT();
  const options = getCareerOpportunityManagementStatusOptions(t);
  const statusLabel = getCareerOpportunityManagementStatusLabel(status, t);

  return (
    <div
      data-career-card-action="true"
      onClick={stopCardActivation}
      onPointerDown={stopCardActivation}
    >
      <ActionDropdown
        align="end"
        contentClassName="min-w-[190px]"
        trigger={
          <MuteButton
            variant="transparent"
            aria-label={`${statusLabel} 상태 변경`}
            disabled={disabled}
          >
            <EllipsisVertical className="h-4 w-4" />
          </MuteButton>
        }
      >
        {options.map((option) => (
          <ActionDropdownItem
            key={option.id}
            selected={option.id === status}
            disabled={disabled}
            onSelect={() => onChange(option.id)}
          >
            {option.label}
          </ActionDropdownItem>
        ))}
      </ActionDropdown>
    </div>
  );
};

const OpportunityListCard = ({
  item,
  pending,
  onOpenDetail,
  savedStatus,
  onSavedStatusChange,
  onInternalDecisionAction,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo?: (type: CareerOpportunityType) => void;
  savedStatus?: CareerOpportunityManagementStatus;
  onSavedStatusChange?: (
    item: CareerHistoryOpportunity,
    value: CareerOpportunityManagementStatus
  ) => void;
  onInternalDecisionAction?: (
    item: CareerHistoryOpportunity,
    action: CareerInternalOpportunityDecisionAction
  ) => void;
}) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const status = savedStatus;
  const inProgress = status === "applied" || status === "connected" || status === "offer";
  const expired = isCareerHistoryOpportunityExpired(item);
  const postedAgo = formatRelativeTime(item.postedAt, locale);
  const deadline = getOpportunityDeadlineLabel(item, locale, t);
  const workMode = item.workMode?.trim().toLowerCase();
  const locationMeta = [
    formatCareerLocation(item.location, locale),
    workMode === "onsite" || workMode === "on-site" || workMode === "on_site"
      ? null
      : item.workMode,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasActionArea = Boolean(
    (savedStatus &&
      onSavedStatusChange &&
      canChangeCareerOpportunityManagementStatus(item)) ||
    (item.isInternal && onInternalDecisionAction)
  );

  if (inProgress) return <ProgressOpportunityRow item={item} pending={pending} status={status} onStatusChange={onSavedStatusChange && canChangeCareerOpportunityManagementStatus(item) ? (next) => onSavedStatusChange(item, next) : undefined} onOpenDetail={onOpenDetail} />;

  return (
    <InlinePanel
      className={cn(
        "group relative flex h-full flex-col rounded-md border border-neutral-1000-a05 bg-bg-floating p-0 shadow-none transition-colors hover:border-neutral-400 hover:bg-bg-weak",
        pending && "opacity-60"
      )}
    >
      {hasActionArea && (
        <div className="absolute right-2 top-2 z-10">
          {item.isInternal && onInternalDecisionAction ? (
            <InternalOpportunityDecisionMenu
              onCard
              item={item}
              pending={pending}
              onAction={(action) => onInternalDecisionAction(item, action)}
            />
          ) : savedStatus && onSavedStatusChange ? (
            <SavedManagementStatusDropdown
              status={savedStatus}
              disabled={pending}
              onChange={(status) => onSavedStatusChange(item, status)}
            />
          ) : null}
        </div>
      )}
      <ClickablePanel
        onActivate={() => onOpenDetail(item)}
        className="flex min-w-0 flex-1 cursor-pointer flex-col p-3 text-left"
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            hasActionArea && "pr-9"
          )}
        >
          {item.companyLogoUrl ? (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-default p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.companyLogoUrl}
                alt={item.companyName}
                className="h-full w-full rounded-md object-cover"
              />
            </span>
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-inverse text-neutral-00">
              <Building2 className="h-3.5 w-3.5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium leading-5 text-neutral-primary">
              {item.companyName}
            </div>
            {locationMeta ? (
              <div className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-neutral-muted">
                {locationMeta}
              </div>
            ) : null}
          </div>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-neutral-muted" />
          ) : null}
        </div>
        <div className="mt-3 line-clamp-2 text-[14px] font-normal leading-5 text-neutral-primary">
          {item.title}
        </div>
        <UpcomingMeetingStrip
          meeting={item.upcomingMeeting}
          className="-mx-3 mt-2 rounded-none px-3 py-1 text-[11px] leading-4"
        />
        {inProgress ? (
          <div className="mt-auto pt-3 text-[12px] font-medium leading-4 text-action-strong">
            {getCareerOpportunityManagementStatusLabel(status, t)}
          </div>
        ) : postedAgo || deadline || expired ? (
          <div className="mt-auto flex items-end justify-between gap-2 pt-3 text-[12px] leading-4">
            <span className="text-neutral-muted">
              {postedAgo
                ? t(
                    "career.history.my_opportunities.posted_ago",
                    "{postedAgo}에 게시됨",
                    { values: { postedAgo } }
                  )
                : null}
            </span>
            <span
              className={cn(
                "shrink-0 text-right",
                expired ? "font-medium text-info-strong" : "text-neutral-muted"
              )}
            >
              {expired
                ? t("career.history.posting.closed", "마감됨")
                : deadline}
            </span>
          </div>
        ) : null}
      </ClickablePanel>
    </InlinePanel>
  );
};

export default React.memo(OpportunityListCard);
