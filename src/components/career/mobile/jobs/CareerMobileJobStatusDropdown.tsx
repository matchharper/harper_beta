"use client";

import React from "react";
import { EllipsisVertical } from "lucide-react";
import {
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "@/components/career/history/savedOpportunityStatus";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

type CareerMobileJobStatusDropdownProps = {
  disabled: boolean;
  status: CareerOpportunityManagementStatus;
  onChange: (value: CareerOpportunityManagementStatus) => void;
};

const stopCardActivation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export function CareerMobileJobStatusDropdown({
  disabled,
  status,
  onChange,
}: CareerMobileJobStatusDropdownProps) {
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
          <BareButton
            type="button"
            aria-label={t(
              "career.history.opportunity_list_card.status_menu",
              "{status} 상태 변경",
              { values: { status: statusLabel } }
            )}
            disabled={disabled}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-neutral-200 text-neutral-primary transition-colors hover:bg-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <EllipsisVertical className="h-4 w-4" />
          </BareButton>
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
}
