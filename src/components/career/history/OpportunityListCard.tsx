import React from "react";
import {
  CareerHistoryOpportunity,
  CareerHistoryOpportunityFeedback,
  CareerOpportunitySavedStage,
  CareerOpportunityType,
} from "../types";
import { careerCx, CareerInlinePanel } from "../ui/CareerPrimitives";
import { getOpportunityPanelTone } from "../CareerHistoryPanel";
import { ChevronDown, Dot } from "lucide-react";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
} from "@/components/ui/beige/action-dropdown";
import {
  getOpportunityStatusLabel,
  getResolvedSavedStage,
} from "../CareerHistoryPanel";
import { OpportunityHeader } from "./HistoryOpportunityDetailContent";
import OpportunityPreferenceFit from "./OpportunityPreferenceFit";

type HistoryStatusDropdownValue = "new" | "saved" | "negative";

const HISTORY_STATUS_OPTIONS: Array<{
  value: HistoryStatusDropdownValue;
  label: string;
}> = [
  { value: "new", label: "새 포지션" },
  { value: "saved", label: "저장함" },
  { value: "negative", label: "선호하지 않음" },
];

const getStatusDropdownValue = (
  item: CareerHistoryOpportunity
): HistoryStatusDropdownValue | null => {
  if (item.feedback === "negative") return "negative";
  if (item.feedback === "positive") {
    return getResolvedSavedStage(item) === "saved" ? "saved" : null;
  }
  return "new";
};

const getStatusDropdownTriggerLabel = (item: CareerHistoryOpportunity) => {
  if (item.feedback === "negative") return "선호하지 않음";
  return getOpportunityStatusLabel(item) ?? "새 포지션";
};

const stopCardActivation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

const HistoryStatusDropdown = ({
  disabled,
  item,
  onChange,
}: {
  disabled: boolean;
  item: CareerHistoryOpportunity;
  onChange: (value: HistoryStatusDropdownValue) => void;
}) => {
  const value = getStatusDropdownValue(item);

  return (
    <div
      data-career-card-action="true"
      onClick={stopCardActivation}
      onPointerDown={stopCardActivation}
    >
      <BeigeActionDropdown
        align="end"
        contentClassName="min-w-[180px]"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="inline-flex h-9 min-w-[148px] items-center justify-between gap-2 rounded-md border border-beige900/15 bg-white/60 px-3 text-sm text-beige900 transition-colors hover:border-beige900/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{getStatusDropdownTriggerLabel(item)}</span>
            <ChevronDown className="h-4 w-4 text-beige900/50" />
          </button>
        }
      >
        {HISTORY_STATUS_OPTIONS.map((option) => (
          <BeigeActionDropdownItem
            key={option.value}
            selected={option.value === value}
            disabled={disabled}
            onSelect={() => onChange(option.value)}
          >
            {option.label}
          </BeigeActionDropdownItem>
        ))}
      </BeigeActionDropdown>
    </div>
  );
};

export const getFeedbackForStatusDropdownValue = (
  value: HistoryStatusDropdownValue
): {
  feedback: CareerHistoryOpportunityFeedback | null;
  savedStage: CareerOpportunitySavedStage | null;
} => {
  if (value === "saved") {
    return { feedback: "positive", savedStage: "saved" };
  }
  if (value === "negative") {
    return { feedback: "negative", savedStage: null };
  }
  return { feedback: null, savedStage: null };
};

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
  showStatusSelect = false,
  onOpenDetail,
  onOpenCompanyInfo,
  onOpenOpportunityInfo,
  onStatusChange,
}: {
  action?: React.ReactNode;
  item: CareerHistoryOpportunity;
  pending: boolean;
  showStatusSelect?: boolean;
  onOpenDetail: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onStatusChange?: (value: HistoryStatusDropdownValue) => void;
}) => {
  const recommendationReasons = item.recommendationReasons.slice(0, 2);
  const recommendationSummary = item.recommendationSummary?.trim() ?? "";
  const recommendationConcerns = (item.recommendationConcerns ?? []).slice(
    0,
    1
  );
  const hasActionArea = Boolean(
    action || (showStatusSelect && onStatusChange)
  );

  return (
    <CareerInlinePanel
      className={careerCx(
        "rounded-[8px] px-4 py-4 transition-colors hover:border-beige900/20",
        getOpportunityPanelTone(item)
      )}
    >
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
                    {showStatusSelect && onStatusChange && (
                      <HistoryStatusDropdown
                        item={item}
                        disabled={pending}
                        onChange={onStatusChange}
                      />
                    )}
                    {action ? <CardActionArea>{action}</CardActionArea> : null}
                  </div>
                )}
              </>
            }
          />

          <div className="mt-4 space-y-2">
            {recommendationSummary ? (
              <div className="rounded-[8px] border border-beige900/10 bg-white/65 px-3 py-2 text-[14px] leading-6 text-beige900/90">
                {recommendationSummary}
              </div>
            ) : null}
            {recommendationReasons.length > 0 &&
              recommendationReasons.map((reason, index) => (
                <div
                  key={`${item.id}-reason-${index}`}
                  className="flex items-start gap-2 text-[14px] leading-6 text-beige900/70"
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
                  className="flex items-start gap-2 text-[14px] leading-6"
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
