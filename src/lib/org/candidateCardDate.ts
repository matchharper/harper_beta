import type { OrgBoardItem } from "./server";

type CandidateCardDate = Pick<
  OrgBoardItem,
  "companyPresentedAt" | "recommendedAt" | "source" | "stage"
>;

export function getOrgCandidateCardDate(item: CandidateCardDate) {
  if (item.stage === "pending_connection") {
    return item.companyPresentedAt ?? null;
  }
  if (item.source === "company_intro") {
    return item.companyPresentedAt ?? item.recommendedAt;
  }
  return item.recommendedAt;
}

export function compareOrgCandidateCardDates(
  left: CandidateCardDate,
  right: CandidateCardDate
) {
  const timestamp = (item: CandidateCardDate) =>
    Date.parse(getOrgCandidateCardDate(item) ?? "") || 0;
  return timestamp(right) - timestamp(left);
}
