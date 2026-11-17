import { memo } from "react";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import OpportunityPostingSummary from "./OpportunityPostingSummary";
import type { CareerHistoryOpportunity } from "../types";
import OpportunityCard from "./OpportunityCard";
import { getHiringPostApplyLabel, isHiringPostOpportunity } from "./hiringPost";
import { isCareerHistoryOpportunityExpired } from "./opportunityPostingStatus";

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
  const expired =
    isCareerHistoryOpportunityExpired(item) || item.status === "deleted";
  return (
    <OpportunityCard
      item={item}
      expanded={false}
      showUnreadIndicator={false}
      onOpenDetail={() => onOpenDetail(item)}
      collapsedActions={
        <MuteButton
          variant="dark"
          disabled={pending || expired}
          onClick={() => onApply(item)}
        >
          {isHiringPostOpportunity(item)
            ? getHiringPostApplyLabel(t)
            : t("career.history.external_application.apply", "지원하기")}
        </MuteButton>
      }
      collapsedFooter={<OpportunityPostingSummary item={item} />}
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
