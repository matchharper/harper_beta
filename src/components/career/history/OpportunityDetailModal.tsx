import TalentCareerModal from "@/components/common/TalentCareerModal";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import {
  HistoryFeedbackButton,
  getPositiveActionLabel,
  getNegativeActionLabel,
} from "../CareerHistoryPanel";
import { ArchiveRestore, StickyNote, ThumbsDown } from "lucide-react";
import {
  getCareerFeedbackButtonClassName,
  getCareerDefaultFeedbackButtonClassName,
  getCareerPositiveActionIcon,
} from "../opportunityTypeMeta";
import HistoryOpportunityDetailContent from "./HistoryOpportunityDetailContent";
import React from "react";

const OpportunityDetailModal = ({
  item,
  open,
  pending,
  onClose,
  onOpenCompanyInfo,
  onOpenLink,
  onOpenOpportunityInfo,
  onPositive,
  onNegative,
  onQuestion,
  onRestore,
  onEditMemo,
}: {
  item: CareerHistoryOpportunity | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onOpenCompanyInfo?: (item: CareerHistoryOpportunity) => void;
  onOpenLink: (url: string) => void;
  onOpenOpportunityInfo: (type: CareerOpportunityType) => void;
  onPositive: () => void;
  onNegative: () => void;
  onQuestion: () => void;
  onRestore?: () => void;
  onEditMemo?: () => void;
}) => {
  if (!open || !item) return null;

  const PositiveActionIcon = getCareerPositiveActionIcon(item.opportunityType);
  const talentMemo = item.talentMemo?.trim() ?? "";

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel={`${item.title} 상세`}
      overlayClassName="items-start pt-10"
      panelClassName="w-[min(1040px,56vw)] max-w-none border border-beige900/10 bg-beige50"
      bodyClassName="max-h-[82svh] overflow-y-auto bg-beige50 px-5 pb-5 pt-14"
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
              icon={<PositiveActionIcon className="h-4 w-4" />}
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
          {onRestore && (
            <div className="flex-1">
              <HistoryFeedbackButton
                className={getCareerDefaultFeedbackButtonClassName(false)}
                disabled={pending}
                icon={<ArchiveRestore className="h-4 w-4" />}
                label="새 기회로 되돌리기"
                onClick={onRestore}
              />
            </div>
          )}
        </div>
        {/* <div className="mt-4 mb-4 flex flex-row items-start justify-start gap-2">
          {onEditMemo && (
            <div className="flex-1">
              <HistoryFeedbackButton
                className={getCareerDefaultFeedbackButtonClassName(
                  Boolean(item.talentMemo?.trim())
                )}
                disabled={pending}
                icon={<StickyNote className="h-4 w-4" />}
                label={item.talentMemo?.trim() ? "메모 수정" : "메모하기"}
                onClick={onEditMemo}
              />
            </div>
          )}
          <div className="w-[80%] px-2 whitespace-pre-wrap text-sm leading-6 text-black">
            {talentMemo ? talentMemo : "메모를 남겨보세요"}
          </div>
        </div> */}

        <HistoryOpportunityDetailContent
          item={item}
          onOpenCompanyInfo={onOpenCompanyInfo}
          onOpenLink={onOpenLink}
          onOpenOpportunityInfo={onOpenOpportunityInfo}
        />
      </div>
    </TalentCareerModal>
  );
};

export default React.memo(OpportunityDetailModal);
