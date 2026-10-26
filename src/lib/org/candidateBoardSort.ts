import { compareOrgCandidateCardDates } from "./candidateCardDate";
import type { OrgBoardItem } from "./server";

export type OrgCandidateSort = "recommended" | "latest";

type SortableCandidate = Pick<
  OrgBoardItem,
  | "recommendationScore"
  | "recommendationRank"
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
    // Browser responses carry a rank instead of the raw score; same order.
    const leftRank = left.recommendationRank ?? null;
    const rightRank = right.recommendationRank ?? null;
    if (leftRank !== null || rightRank !== null) {
      if (leftRank !== rightRank) {
        if (leftRank === null) return 1;
        if (rightRank === null) return -1;
        return leftRank - rightRank;
      }
      return (
        compareOrgCandidateCardDates(left, right) ||
        left.recommendationId.localeCompare(right.recommendationId)
      );
    }
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

/**
 * For responses that leave the server: the raw recommendation score becomes
 * a rank (1 = highest, ties share a rank) so the screen sorts the same way
 * without receiving the scoring scale.
 */
export function withRecommendationRank<T extends { recommendationScore?: number | null; recommendationRank?: number | null }>(
  items: T[]
): T[] {
  const scores = [
    ...new Set(
      items
        .map((item) => item.recommendationScore)
        .filter((score): score is number => typeof score === "number" && Number.isFinite(score))
    ),
  ].sort((left, right) => right - left);
  const rankOf = new Map(scores.map((score, index) => [score, index + 1]));
  return items.map((item) => {
    const { recommendationScore, ...rest } = item;
    return {
      ...rest,
      recommendationRank:
        typeof recommendationScore === "number" ? (rankOf.get(recommendationScore) ?? null) : null,
    } as T;
  });
}
