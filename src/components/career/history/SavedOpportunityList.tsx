import { memo } from "react";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityCard from "./OpportunityCard";
import { getHiringPostApplyLabel, isHiringPostOpportunity } from "./hiringPost";
import {
  getOpportunityDeadlineLabel,
  isCareerHistoryOpportunityExpired,
} from "./opportunityPostingStatus";

type ItemProps = {
  item: CareerHistoryOpportunity;
  pending: boolean;
  onOpenDetail: (item: CareerHistoryOpportunity) => void;
  onApply: (item: CareerHistoryOpportunity) => void;
};

const SavedOpportunityRow = memo(function SavedOpportunityRow({
  item,
  pending,
  onOpenDetail,
  onApply,
}: ItemProps) {
  const t = useCareerT();
  const { locale } = useMessages();
  const expired =
    isCareerHistoryOpportunityExpired(item) || item.status === "deleted";
  const deadline = expired
    ? t("career.history.posting.closed", "마감됨")
    : getOpportunityDeadlineLabel(item, locale, t);

  return (
    <OpportunityCard
      item={item}
      expanded={false}
      showUnreadIndicator={false}
      onOpenDetail={() => onOpenDetail(item)}
      collapsedActions={
        <MuteButton
          variant="dark"
          size="sm"
          disabled={pending || expired}
          onClick={() => onApply(item)}
        >
          {isHiringPostOpportunity(item)
            ? getHiringPostApplyLabel(t)
            : t("career.history.external_application.apply", "지원하기")}
        </MuteButton>
      }
      collapsedFooter={
        deadline ? (
          <span className="mt-1 block text-[12px] text-neutral-muted">
            {deadline}
          </span>
        ) : null
      }
    />
  );
});

export default function SavedOpportunityList({
  items,
  pendingOpportunityIds,
  onOpenDetail,
  onApply,
}: {
  items: CareerHistoryOpportunity[];
  pendingOpportunityIds?: Set<string>;
  onOpenDetail: ItemProps["onOpenDetail"];
  onApply: ItemProps["onApply"];
}) {
  return (
    <div className="flex flex-col gap-3 pb-3">
      {items.map((item) => (
        <SavedOpportunityRow
          key={item.id}
          item={item}
          pending={Boolean(pendingOpportunityIds?.has(item.id))}
          onOpenDetail={onOpenDetail}
          onApply={onApply}
        />
      ))}
    </div>
  );
}
