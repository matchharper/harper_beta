import React from "react";
import {
  CareerHistoryOpportunity,
  CareerOpportunitySavedStage,
  CareerOpportunityType,
} from "../types";
import { careerCx, CareerInlinePanel } from "../ui/CareerPrimitives";
import { SAVED_TABS } from "../CareerHistoryPanel";
import { getOpportunityPanelTone } from "../CareerHistoryPanel";
import { Building2, ChevronDown } from "lucide-react";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
} from "@/components/ui/beige-action-dropdown";
import {
  getResolvedSavedStage,
  getSavedStageLabel,
} from "../CareerHistoryPanel";
import { OpportunityHeader } from "./HistoryOpportunityDetailContent";

const HistorySavedStageDropdown = ({
  disabled,
  item,
  onChange,
}: {
  disabled: boolean;
  item: CareerHistoryOpportunity;
  onChange: (stage: CareerOpportunitySavedStage) => void;
}) => {
  const value = getResolvedSavedStage(item);

  return (
    <BeigeActionDropdown
      align="end"
      contentClassName="min-w-[180px]"
      trigger={
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-md border border-beige900/15 bg-white/60 px-3 text-sm text-beige900 transition-colors hover:border-beige900/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{getSavedStageLabel(value, item)}</span>
          <ChevronDown className="h-4 w-4 text-beige900/50" />
        </button>
      }
    >
      {SAVED_TABS.map((stage) => (
        <BeigeActionDropdownItem
          key={stage.id}
          selected={stage.id === value}
          onSelect={() => onChange(stage.id)}
        >
          {getSavedStageLabel(stage.id, item)}
        </BeigeActionDropdownItem>
      ))}
    </BeigeActionDropdown>
  );
};

const OpportunityListCard = ({
  action,
  item,
  pending,
  showSavedStageSelect = false,
  onOpenDetail,
  onOpenOpportunityInfo,
  onSavedStageChange,
}: {
  action?: React.ReactNode;
  item: CareerHistoryOpportunity;
  pending: boolean;
  showSavedStageSelect?: boolean;
  onOpenDetail: () => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onSavedStageChange?: (stage: CareerOpportunitySavedStage) => void;
}) => {
  const recommendationReasons = item.recommendationReasons.slice(0, 2);
  const hasActionArea = Boolean(
    action || (showSavedStageSelect && onSavedStageChange)
  );

  return (
    <CareerInlinePanel
      className={careerCx(
        "rounded-[8px] px-4 py-4 transition-colors hover:border-beige900/20",
        getOpportunityPanelTone(item)
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={onOpenDetail}
          className="min-w-0 flex-1 text-left p-2"
        >
          <OpportunityHeader
            item={item}
            onOpenOpportunityInfo={onOpenOpportunityInfo}
            extraComponent={
              <>
                {hasActionArea && (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {showSavedStageSelect && onSavedStageChange && (
                      <HistorySavedStageDropdown
                        item={item}
                        disabled={pending}
                        onChange={onSavedStageChange}
                      />
                    )}
                    {action}
                  </div>
                )}
              </>
            }
          />

          <div className="mt-4 space-y-2">
            {recommendationReasons.length > 0 &&
              recommendationReasons.map((reason, index) => (
                <div
                  key={`${item.id}-reason-${index}`}
                  className="flex items-start gap-2 text-[14px] leading-6 text-beige900/72"
                >
                  <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-beige900/40" />
                  <div
                    className="line-clamp-2 min-w-0"
                    dangerouslySetInnerHTML={{ __html: reason }}
                  />
                </div>
              ))}
          </div>
        </button>
      </div>
    </CareerInlinePanel>
  );
};

export default OpportunityListCard;
