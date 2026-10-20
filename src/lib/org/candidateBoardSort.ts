import { compareOrgCandidateCardDates } from "./candidateCardDate";
import type { OrgBoardItem } from "./server";

export type OrgCandidateSort = "recommended" | "latest";

type SortableCandidate = Pick<
  OrgBoardItem,
  | "recommendationScore"
  | "recommendationId"
  | "companyPresentedAt"
  | "recommendedAt"
  | "source"
  | "stage"
>;

export function compareOrgCandidates(
  left: SortableCandidate,
  right: SortableCandidate,
  sort: OrgCandidateSort
) {
  if (sort === "recommended") {
    const score = (item: SortableCandidate) =>
      typeof item.recommendationScore === "number" &&
      Number.isFinite(item.recommendationScore)
        ? item.recommendationScore
        : null;
    const leftScore = score(left);
    const rightScore = score(right);
    if (leftScore !== rightScore) {
      if (leftScore === null) return 1;
      if (rightScore === null) return -1;
      return rightScore - leftScore;
    }
  }
  return (
    compareOrgCandidateCardDates(left, right) ||
    left.recommendationId.localeCompare(right.recommendationId)
  );
}
