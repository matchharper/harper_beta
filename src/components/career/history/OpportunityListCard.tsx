import React from "react";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import { InlinePanel } from "@/components/ui/panel";
import { ChevronDown, StickyNote } from "lucide-react";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { ClickablePanel } from "@/components/ui/clickable-panel";
import { OpportunityHeader } from "./HistoryOpportunityDetailContent";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import {
  getSavedOpportunityStatusLabel,
  SAVED_OPPORTUNITY_STATUS_OPTIONS,
  type SavedOpportunityManagementStatus,
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
  status: SavedOpportunityManagementStatus;
  onChange: (value: SavedOpportunityManagementStatus) => void;
}) => (
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
          disabled={disabled}
          className="inline-flex h-9 min-w-[156px] items-center justify-between gap-2 rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-sm font-medium text-neutral-primary hover:border-neutral-400 hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{getSavedOpportunityStatusLabel(status)}</span>
          <ChevronDown className="h-4 w-4 text-neutral-muted" />
        </BareButton>
      }
    >
      {SAVED_OPPORTUNITY_STATUS_OPTIONS.map((option) => (
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

const CardActionArea = ({ children }: { children: React.ReactNode }) => (
  <div
    data-career-card-action="true"
    onClick={stopCardActivation}
    onPointerDown={stopCardActivation}
  >
    {children}
  </div>
);

const OpportunityListCard = ({
  action,
  item,
  pending,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  onEditMemo,
  savedStatus,
  onSavedStatusChange,
}: {
  action?: React.ReactNode;
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onEditMemo?: (item: CareerHistoryOpportunity) => void;
  savedStatus?: SavedOpportunityManagementStatus;
  onSavedStatusChange?: (value: SavedOpportunityManagementStatus) => void;
}) => {
  const t = useCareerT();

  const recommendationReasons = item.recommendationReasons.slice(0, 2);
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationConcerns = (item.recommendationConcerns ?? []).slice(
    0,
    1
  );
  const talentMemo = item.talentMemo?.trim() ?? "";
  const hasActionArea = Boolean(
    action || onEditMemo || (savedStatus && onSavedStatusChange)
  );

  return (
    <InlinePanel className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating p-4 transition-colors hover:bg-bg-weak">
      <div className="flex items-start justify-between gap-4">
        <ClickablePanel
          onActivate={() => {
            onOpenDetail();
          }}
          className="min-w-0 flex-1 cursor-pointer p-2 text-left"
        >
          <OpportunityHeader
            item={item}
            onOpenCompanyInfo={onOpenCompanyInfo}
            onOpenOpportunityInfo={onOpenOpportunityInfo}
            extraComponent={
              <>
                {hasActionArea && (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {savedStatus && onSavedStatusChange ? (
                      <SavedManagementStatusDropdown
                        status={savedStatus}
                        disabled={pending}
                        onChange={onSavedStatusChange}
                      />
                    ) : null}
                  </div>
                )}
              </>
            }
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
            <OpportunityPreferenceFit
              items={item.preferenceFit}
              variant="compact"
            />
          </div>
        </ClickablePanel>
      </div>
    </InlinePanel>
  );
};

export default React.memo(OpportunityListCard);
