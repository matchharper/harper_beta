import {
  buildFullJdCandidateBatchText,
  type FullJdPromptCandidate,
} from "../talentOnboarding/jobPostingFullJdScoring";
import {
  fullJdPromptCandidate,
  type RoleCard,
} from "../talentOnboarding/jobPostingRecommendations";
import { evidenceText } from "./context";
export function v2PromptCandidate(
  card: RoleCard,
  language: "ko" | "en"
): FullJdPromptCandidate {
  // Display names are not company identifiers. Two workspaces can share a name
  // and carry different evidence; grouping by name silently drops the second.
  return {
    ...fullJdPromptCandidate(card, language),
    companyKey: card.companyWorkspaceId || card.roleId,
  };
}
export function buildScoringInput(
  context: unknown,
  candidates: FullJdPromptCandidate[]
) {
  return `[CANDIDATE]\n${evidenceText(context)}\n[OPPORTUNITIES]\n${buildFullJdCandidateBatchText(candidates.map((c) => ({ ...c, cachedRoleSummary: null })))}`;
}
