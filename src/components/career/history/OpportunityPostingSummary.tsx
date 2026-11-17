import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type { CareerHistoryOpportunity } from "../types";
import {
  getOpportunityDeadlineLabel,
  getOpportunityPostingStatus,
} from "./opportunityPostingStatus";

export default function OpportunityPostingSummary({
  item,
}: {
  item: CareerHistoryOpportunity;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const posting = getOpportunityPostingStatus(item, locale, t);
  const closed = item.status === "deleted" || posting?.isExpired;
  const label = closed
    ? t("career.history.posting.closed", "마감됨")
    : [posting?.label, getOpportunityDeadlineLabel(item, locale, t)]
        .filter(Boolean)
        .join(" · ");
  return label ? (
    <span className="mt-1 block text-xs leading-5 text-neutral-muted">
      {label}
    </span>
  ) : null;
}
