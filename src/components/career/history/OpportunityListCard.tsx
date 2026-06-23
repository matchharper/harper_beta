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
  getCareerOpportunityManagementStatusLabel,
  getCareerOpportunityManagementStatusOptions,
  type CareerOpportunityManagementStatus,
} from "./savedOpportunityStatus";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

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
          <BareButton
            type="button"
            aria-label={t(
              "career.history.opportunity_list_card.status_menu",
              "{status} 상태 변경",
              { values: { status: statusLabel } }
            )}
            disabled={disabled}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-neutral-200 text-neutral-primary transition-colors hover:bg-neutral-400 disabled:cursor-not-allowed disabled:opacity-60"
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
};

const OpportunityListCard = ({
  item,
  pending,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  savedStatus,
  onSavedStatusChange,
}: {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  savedStatus?: CareerOpportunityManagementStatus;
  onSavedStatusChange?: (value: CareerOpportunityManagementStatus) => void;
}) => {
  const t = useCareerT();

  const recommendationReasons = item.recommendationReasons.slice(0, 2);
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationConcerns = (item.recommendationConcerns ?? []).slice(
    0,
    1
  );
  const hasActionArea = Boolean(savedStatus && onSavedStatusChange);

  return (
    <InlinePanel className="relative rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-2 transition-colors hover:bg-bg-weak">
      {hasActionArea && (
        <div className="absolute right-2 top-2 z-10">
          {savedStatus && onSavedStatusChange ? (
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
        className="min-w-0 flex-1 cursor-pointer p-2 px-3 text-left"
      >
        <OpportunityHeader
          item={item}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
          extraComponent={<></>}
        />

        <div className="mt-4 space-y-3 text-sm text-neutral-primary">
          {recommendationSummary && <div>{recommendationSummary}</div>}
          {recommendationReasons.length > 0 &&
            recommendationReasons.map((reason, index) => (
              <div
                key={`${item.id}-reason-${index}`}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-black/40" />
                <div
                  className="line-clamp-2 min-w-0"
                  dangerouslySetInnerHTML={{ __html: reason }}
                />
              </div>
            ))}
          {recommendationConcerns.length > 0 &&
            recommendationConcerns.map((concern, index) => (
              <div
                key={`${item.id}-concern-${index}`}
                className="flex items-start gap-2 text-sm"
              >
                <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-black" />
                <div className="text-sm leading-6 text-neutral-muted">
                  {t(
                    "career.history.opportunity_list_card.0l12x89",
                    "주의 요소 :"
                  )}{" "}
                  {concern}
                </div>
              </div>
            ))}
        </div>
      </ClickablePanel>
    </InlinePanel>
  );
};

export default React.memo(OpportunityListCard);
