import { formatRelativeTime } from "@/lib/utils";
import { careerT } from "@/lib/career/translatedCareerMessage";
import type { Locale } from "@/i18n/useMessage";
import type { CareerHistoryOpportunity } from "../types";

const INACTIVE_ROLE_STATUSES = new Set([
  "archived",
  "closed",
  "expired",
  "inactive",
]);

export type OpportunityPostingStatus = {
  isExpired: boolean;
  label: string;
};

export function isCareerHistoryOpportunityExpired(
  item: Pick<CareerHistoryOpportunity, "expiresAt" | "isExpired" | "status">
) {
  if (item.isExpired === true) return true;

  const normalizedStatus = String(item.status ?? "")
    .trim()
    .toLowerCase();
  if (INACTIVE_ROLE_STATUSES.has(normalizedStatus)) return true;

  if (!item.expiresAt) return false;
  const expiresAtMs = Date.parse(item.expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs < Date.now();
}

export function getOpportunityPostingStatus(
  item: CareerHistoryOpportunity,
  locale: Locale = "ko"
): OpportunityPostingStatus | null {
  if (isCareerHistoryOpportunityExpired(item)) {
    return {
      isExpired: true,
      label: careerT(locale, "career.history.posting.closed", "지난 공고."),
    };
  }

  const postedAgo = formatRelativeTime(item.postedAt, locale);
  if (!postedAgo) return null;

  return {
    isExpired: false,
    label: careerT(
      locale,
      "career.history.posting.posted_ago",
      "{postedAgo}에 게시됨",
      {
        values: { postedAgo },
      }
    ),
  };
}
