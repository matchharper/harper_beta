import TalentCareerModal from "@/components/common/TalentCareerModal";
import { CareerHistoryOpportunity, CareerOpportunityType } from "../types";
import {
  HistoryFeedbackButton,
  getPositiveActionLabel,
  getNegativeActionLabel,
} from "../CareerHistoryPanel";
import {
  ArchiveRestore,
  StickyNote,
  ThumbsDown,
  type LucideIcon,
} from "lucide-react";
import {
  getCareerDefaultFeedbackButtonClassName,
  getCareerFeedbackButtonClassName,
  getCareerPositiveActionIcon,
} from "../opportunityTypeMeta";
import HistoryOpportunityDetailContent from "./HistoryOpportunityDetailContent";
import React from "react";

const PositiveActionIconView = ({ icon: Icon }: { icon: LucideIcon }) => (
  <Icon className="h-4 w-4" />
);

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
      panelClassName="w-[min(1040px,56vw)] max-w-none border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="max-h-[82svh] overflow-y-auto bg-bg-floating px-5 pb-5 pt-14"
      closeButtonClassName="right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-bg-weak"
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
              icon={<PositiveActionIconView icon={PositiveActionIcon} />}
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
          <div className="w-[80%] px-2 whitespace-pre-wrap text-sm leading-6 text-neutral-primary">
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
