import type { ExternalCandidateView } from "@/lib/org/agent/externalSourcing";
import type { OrgCandidateSort } from "./candidateBoardSort";

/**
 * 외부 후보 in the order the company picked. The server lists them newest
 * search first, Harper's best first within a search: that is 최신순.
 * 추천순 puts Harper's order first (rank 1 of each search before rank 2),
 * keeping the server order among equal ranks; people without a rank go last.
 */
export function sortExternalCandidates(
  candidates: readonly ExternalCandidateView[],
  sort: OrgCandidateSort
): ExternalCandidateView[] {
  if (sort === "latest") return [...candidates];
  const rank = (person: ExternalCandidateView) =>
    typeof person.rank === "number" && Number.isFinite(person.rank) ? person.rank : null;
  return candidates
    .map((person, index) => ({ index, person, rank: rank(person) }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        if (left.rank === null) return 1;
        if (right.rank === null) return -1;
        return left.rank - right.rank;
      }
      return left.index - right.index;
    })
    .map(({ person }) => person);
}
