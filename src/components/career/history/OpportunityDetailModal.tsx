import TalentCareerModal from "@/components/common/TalentCareerModal";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import {
  HistoryFeedbackButton,
  getPositiveActionLabel,
  getNegativeActionLabel,
} from "../CareerHistoryPanel";
import { ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react";
import {
  getCareerFeedbackButtonClassName,
  getCareerDefaultFeedbackButtonClassName,
} from "../opportunityTypeMeta";
import HistoryOpportunityDetailContent from "./HistoryOpportunityDetailContent";
import React from "react";

const OpportunityDetailModal = ({
  item,
  open,
  pending,
  onClose,
  onOpenLink,
  onOpenOpportunityInfo,
  onPositive,
  onNegative,
  onQuestion,
}: {
  item: CareerHistoryOpportunity | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onPositive: () => void;
  onNegative: () => void;
  onQuestion: () => void;
}) => {
  if (!open || !item) return null;

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel={`${item.title} 상세`}
      overlayClassName="items-start pt-10"
      panelClassName="w-[min(1040px,56vw)] max-w-none border border-beige900/10 bg-beige50"
      bodyClassName="max-h-[82vh] overflow-y-auto bg-beige50 px-5 pb-5 pt-14"
      closeButtonClassName="font-geist right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-beige200"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <HistoryFeedbackButton
              className={getCareerFeedbackButtonClassName(
                item.opportunityType,
                item.feedback === "positive"
              )}
              disabled={pending}
              icon={<ThumbsUp className="h-4 w-4" />}
              label={getPositiveActionLabel(item)}
              onClick={onPositive}
            />
          </div>
          <div className="flex-1">
            <HistoryFeedbackButton
              className={getCareerDefaultFeedbackButtonClassName(
                item.feedback === "negative"
              )}
              disabled={pending}
              icon={<ThumbsDown className="h-4 w-4" />}
              label={getNegativeActionLabel(item)}
              onClick={onNegative}
            />
          </div>
          <div className="flex-1">
            <HistoryFeedbackButton
              className={getCareerDefaultFeedbackButtonClassName(false)}
              disabled={pending}
              icon={<MessageSquare className="h-4 w-4" />}
              label="질문하기"
              onClick={onQuestion}
            />
          </div>
        </div>

        <HistoryOpportunityDetailContent
          item={item}
          onOpenLink={onOpenLink}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
        />
      </div>
    </TalentCareerModal>
  );
};

export default React.memo(OpportunityDetailModal);
