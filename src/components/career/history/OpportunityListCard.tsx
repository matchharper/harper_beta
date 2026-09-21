import React from "react";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import { InlinePanel } from "@/components/ui/panel";
import { EllipsisVertical } from "lucide-react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { OpportunityHeader } from "./HistoryOpportunityDetailContent";
import {
  canChangeCareerOpportunityManagementStatus,
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { InternalOpportunityDecisionMenu } from "./InternalOpportunityDecisionActions";
import type { CareerInternalOpportunityDecisionAction } from "@/lib/career/internalOpportunityDecision";
import OpportunityRecommendationPreview from "./OpportunityRecommendationPreview";
import UpcomingMeetingStrip from "./UpcomingMeetingStrip";

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
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  savedStatus,
  onSavedStatusChange,
  onInternalDecisionAction,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  savedStatus?: CareerOpportunityManagementStatus;
  onSavedStatusChange?: (value: CareerOpportunityManagementStatus) => void;
  onInternalDecisionAction?: (
    action: CareerInternalOpportunityDecisionAction
  ) => void;
}) => {
  const hasActionArea = Boolean(
    (savedStatus &&
      onSavedStatusChange &&
      canChangeCareerOpportunityManagementStatus(item)) ||
    onInternalDecisionAction
  );

  return (
    <InlinePanel className="group relative rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-2 transition-colors hover:bg-bg-weak">
      {hasActionArea && (
        <div className="absolute right-2 top-2 z-10">
          {item.isInternal && onInternalDecisionAction ? (
            <InternalOpportunityDecisionMenu
              onCard
              item={item}
              pending={pending}
              onAction={onInternalDecisionAction}
            />
          ) : savedStatus && onSavedStatusChange ? (
            <SavedManagementStatusDropdown
              status={savedStatus}
              disabled={pending}
              onChange={onSavedStatusChange}
            />
          ) : null}
        </div>
      )}
      <ClickablePanel
        onActivate={() => {
          onOpenDetail();
        }}
        className="min-w-0 flex-1 cursor-pointer pt-2 pb-3 px-3 text-left"
      >
        <OpportunityHeader
          item={item}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
          size="sm"
          extraComponent={<></>}
        />

        {/* <OpportunityRecommendationPreview item={item} /> */}
        <UpcomingMeetingStrip
          meeting={item.upcomingMeeting}
          className="-mx-3 mt-3 rounded-none px-3"
        />
      </ClickablePanel>
    </InlinePanel>
  );
};

export default React.memo(OpportunityListCard);
