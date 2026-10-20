import {
  type FullJdPromptCandidate,
} from "../talentOnboarding/jobPostingFullJdScoring";
import {
  fullJdPromptCandidate,
  type RoleCard,
} from "../talentOnboarding/jobPostingRecommendations";
import { externalScoringInput } from "./workerInputText";
import { descriptionText } from "./descriptionText";
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
  return buildScoringSections(context, candidates).map(section => section.text).join("\n\n");
}

export function buildScoringSections(context: unknown, candidates: FullJdPromptCandidate[]) {
  const sections = [{ name: "candidate", text: externalScoringInput({ user_context: context }) }];
  const groups = new Map<string, FullJdPromptCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.companyKey || candidate.companyName || candidate.roleId;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  for (const roles of groups.values()) {
    const first = roles[0];
    const companyData = first.companyData ?? {};
    const evidence = {
      companyName: first.companyName,
      ...first.company,
      // Same evidence fields as the prior full-JD formatter, without truncation.
      companyData: Object.fromEntries(["lastFundingStage", "totalFundingRaised", "mainInvestors", "lastFundingRoundDescription"].map(k => [k, companyData[k] ?? null])),
      companyLeadership: first.companyLeadership ?? [],
      roles: roles.map(c => ({
        role_id: c.roleId, title: c.roleName, employment: c.employmentType,
        seniority: c.seniorityLevel, location: c.location, workMode: c.workMode,
        compensation: c.salaryRange ?? null, postedAt: c.postedAt,
        description: descriptionText(c.roleDescription),
      })),
    };
    sections.push({ name: `company_${sections.length}`, text: externalScoringInput({ [`company_${sections.length}`]: evidence }) });
  }
  return sections;
}
