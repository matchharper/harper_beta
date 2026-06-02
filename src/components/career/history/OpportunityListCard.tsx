import React from "react";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import { CareerInlinePanel } from "../ui/CareerPrimitives";
import { ChevronDown, StickyNote } from "lucide-react";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
} from "@/components/ui/beige/action-dropdown";
import { OpportunityHeader } from "./HistoryOpportunityDetailContent";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";
import {
  getSavedOpportunityStatusLabel,
  SAVED_OPPORTUNITY_STATUS_OPTIONS,
  type SavedOpportunityManagementStatus,
} from "./savedOpportunityStatus";

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
    <BeigeActionDropdown
      align="end"
      contentClassName="min-w-[190px]"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 min-w-[156px] items-center justify-between gap-2 rounded-md border border-beige900/15 bg-white/70 px-3 text-sm font-medium text-beige900 hover:border-beige900/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{getSavedOpportunityStatusLabel(status)}</span>
          <ChevronDown className="h-4 w-4 text-beige900/65" />
        </button>
      }
    >
      {SAVED_OPPORTUNITY_STATUS_OPTIONS.map((option) => (
        <BeigeActionDropdownItem
          key={option.id}
          selected={option.id === status}
          disabled={disabled}
          onSelect={() => onChange(option.id)}
        >
          {option.label}
        </BeigeActionDropdownItem>
      ))}
    </BeigeActionDropdown>
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
    <CareerInlinePanel className="rounded-[8px] border border-beige900/10 bg-white/55 p-4 transition-colors hover:bg-white/85">
      <div className="flex items-start justify-between gap-4">
        <div
          role="button"
          tabIndex={0}
          onClick={(event) => {
            const interactiveTarget = (event.target as HTMLElement).closest(
              "a,button,input,select,textarea,[data-career-card-action='true']"
            );
            if (interactiveTarget) return;
            onOpenDetail();
          }}
          onKeyDown={(event) => {
            if (event.currentTarget !== event.target) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenDetail();
          }}
          className="min-w-0 flex-1 cursor-pointer p-2 text-left focus:outline-none"
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

          <div className="mt-4 text-sm text-black space-y-3">
            {recommendationSummary && <div>{recommendationSummary}</div>}
            {recommendationReasons.length > 0 &&
              recommendationReasons.map((reason, index) => (
                <div
                  key={`${item.id}-reason-${index}`}
                  className="flex items-start gap-2 text-sm"
                >
                  <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-beige900/40" />
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
                  <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-beige700" />
                  <div className="text-sm leading-6 text-beige700">
                    주의 요소 : {concern}
                  </div>
                </div>
              ))}
            <OpportunityPreferenceFit
              items={item.preferenceFit}
              variant="compact"
            />
          </div>
        </div>
      </div>
    </CareerInlinePanel>
  );
};

export default React.memo(OpportunityListCard);
