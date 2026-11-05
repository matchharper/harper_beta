import React from "react";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import { EllipsisVertical } from "lucide-react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
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
import {
  isCareerHistoryOpportunityExpired,
  getOpportunityDeadlineLabel,
} from "./opportunityPostingStatus";
import ProgressOpportunityRow, {
  OpportunityAppointmentSummary,
} from "./ProgressOpportunityRow";
import OpportunityCard from "./OpportunityCard";

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
  const inProgress =
    status === "applied" || status === "connected" || status === "offer";
  const expired = isCareerHistoryOpportunityExpired(item);
  const deadline = getOpportunityDeadlineLabel(item, locale, t);

  if (inProgress)
    return (
      <ProgressOpportunityRow
        item={item}
        pending={pending}
        status={status}
        onStatusChange={
          onSavedStatusChange &&
          canChangeCareerOpportunityManagementStatus(item)
            ? (next) => onSavedStatusChange(item, next)
            : undefined
        }
        onOpenDetail={onOpenDetail}
      />
    );

  return (
    <OpportunityCard
      item={item}
      expanded={false}
      showUnreadIndicator={false}
      onOpenDetail={() => onOpenDetail(item)}
      onOpenCompanyInfo={onOpenCompanyInfo}
      collapsedActions={
        item.isInternal && onInternalDecisionAction ? (
          <InternalOpportunityDecisionMenu
            onCard
            item={item}
            pending={pending}
            onAction={(action) => onInternalDecisionAction(item, action)}
          />
        ) : savedStatus &&
          onSavedStatusChange &&
          canChangeCareerOpportunityManagementStatus(item) ? (
          <SavedManagementStatusDropdown
            status={savedStatus}
            disabled={pending}
            onChange={(status) => onSavedStatusChange(item, status)}
          />
        ) : null
      }
      collapsedFooter={
        <>
          <OpportunityAppointmentSummary item={item} />
          {expired || deadline ? (
            <span className="mt-1 block text-[12px] text-neutral-muted">
              {expired
                ? t("career.history.posting.closed", "마감됨")
                : deadline}
            </span>
          ) : null}
        </>
      }
    />
  );
};

export default React.memo(OpportunityListCard);
