import React from "react";
import {
  CareerInlinePanel,
  CareerSecondaryButton,
} from "../ui/CareerPrimitives";
import {
  ArrowLeft,
  ArrowRight,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  getCareerDefaultFeedbackButtonClassName,
  getCareerFeedbackButtonClassName,
} from "../opportunityTypeMeta";
import { CareerHistoryOpportunity } from "../types";
import {
  getNegativeActionLabel,
  getPositiveActionLabel,
  HistoryFeedbackButton,
} from "../CareerHistoryPanel";

const HistoryShortcutPanel = ({
  activeIndex,
  totalCount,
  onNext,
  onPrev,
  item,
  pending,
  onPositive,
  onNegative,
  onQuestion,
}: {
  activeIndex: number;
  totalCount: number;
  onNext: () => void;
  onPrev: () => void;
  item: CareerHistoryOpportunity;
  pending: boolean;
  onPositive: () => void;
  onNegative: () => void;
  onQuestion: () => void;
}) => (
  <CareerInlinePanel className="rounded-[8px] border border-beige200 bg-beige100 px-4 py-4">
    <div className="space-y-3">
      <div className="text-[13px] leading-5 text-beige900">
        <div className="mb-2 flex flex-row items-center justify-center gap-2">
          <div className="flex flex-row items-center gap-2">
            <ArrowLeft className="h-3 w-3" /> 이전 기회
          </div>
          <span>·</span>
          <div className="flex flex-row items-center gap-2">
            다음 기회
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <HistoryFeedbackButton
            className={getCareerFeedbackButtonClassName(
              item.opportunityType,
              item.feedback === "positive"
            )}
            disabled={pending}
            hint="T"
            icon={<ThumbsUp className="h-4 w-4" />}
            label={getPositiveActionLabel(item)}
            onClick={onPositive}
          />
          <HistoryFeedbackButton
            className={getCareerDefaultFeedbackButtonClassName(
              item.feedback === "negative"
            )}
            disabled={pending}
            hint="S"
            icon={<ThumbsDown className="h-4 w-4" />}
            label={getNegativeActionLabel(item)}
            onClick={onNegative}
          />
          <HistoryFeedbackButton
            className={getCareerDefaultFeedbackButtonClassName(false)}
            disabled={pending}
            hint="A"
            icon={<MessageSquare className="h-4 w-4" />}
            label="질문하기"
            onClick={onQuestion}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <CareerSecondaryButton
          onClick={onPrev}
          disabled={activeIndex <= 0}
          className="h-9 flex-1 gap-2 px-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Prev
        </CareerSecondaryButton>
        <CareerSecondaryButton
          onClick={onNext}
          disabled={activeIndex >= totalCount - 1}
          className="h-9 flex-1 gap-2 px-3"
        >
          Next
          <ArrowRight className="h-4 w-4" />
        </CareerSecondaryButton>
      </div>
    </div>
  </CareerInlinePanel>
);

export default React.memo(HistoryShortcutPanel);
