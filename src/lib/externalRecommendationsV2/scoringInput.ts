import {
  type FullJdPromptCandidate,
} from "../talentOnboarding/jobPostingFullJdScoring";
import {
  fullJdPromptCandidate,
  type RoleCard,
} from "../talentOnboarding/jobPostingRecommendations";
import { externalScoringInput, renderEvidence } from "./workerInputText";
import { descriptionText } from "./descriptionText";
import { PROMPT_TIME_ZONE, projectLlmDateTimes } from "@/lib/llm/promptDateTime";
export function v2PromptCandidate(
  card: RoleCard,
  language: "ko" | "en",
  publicResearch?: string
): FullJdPromptCandidate {
  const candidate = fullJdPromptCandidate(card, language);
  const summary = card.roleSummary?.[language] as { content?: unknown } | undefined;
  const content = summary?.content;
  // Display names are not company identifiers. Two workspaces can share a name
  // and carry different evidence; grouping by name silently drops the second.
  return {
    ...candidate,
    company: publicResearch ? { ...candidate.company, publicResearch } : candidate.company,
    // Scoring uses any nonempty summary in the requested language, independent
    // of display-summary version/sourceHash validation. Keep the full JD fallback.
    roleDescription: typeof content === "string" && content.trim() ? content : candidate.roleDescription,
    estimatedBaseSalary: card.estimatedBaseSalary ?? null,
    companyKey: card.companyWorkspaceId || card.roleId,
  };
}
export function buildScoringInput(
  context: unknown,
  candidates: FullJdPromptCandidate[]
) {
  return [`Times: ${PROMPT_TIME_ZONE}.`, ...buildScoringSections(context, candidates).map(section => section.text)].join("\n\n");
}

/** buildScoringInput's text split where this batch's opportunities begin.
 * The candidate part repeats across a run's batches, so Decisions can cache it. */
export function buildScoringInputParts(context: unknown, candidates: FullJdPromptCandidate[]) {
  const [candidate, ...opportunities] = buildScoringSections(context, candidates).map(section => section.text);
  return {
    shared: `Times: ${PROMPT_TIME_ZONE}.\n\n${candidate}\n\n`,
    batch: opportunities.join("\n\n"),
  };
}
export type ScoringInputParts = ReturnType<typeof buildScoringInputParts>;

export function buildScoringSections(context: unknown, candidates: FullJdPromptCandidate[]) {
  const sections = [{ name: "candidate", text: externalScoringInput({ user_context: context }) }];
  // Bind refs before company grouping reorders roles. Decisions uses the same
  // original batch indices; UUIDs remain server-side for parsing and persistence.
  const roleRefs = new Map(candidates.map((candidate, index) => [candidate.roleId, `r${index}`]));
  const groups = new Map<string, FullJdPromptCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.companyKey || candidate.companyName || candidate.roleId;
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  for (const roles of groups.values()) {
    const first = roles[0];
    const evidence = {
      companyName: first.companyName,
      ...first.company,
      companyLeadership: first.companyLeadership ?? [],
    };
    // Company/role headings replace the generated roles-array nesting. Keep
    // source prose and its own list indentation intact inside each role.
    const roleSections = roles.map(c => {
      if (c.opportunityKind === "company")
        return `### role_id: ${roleRefs.get(c.roleId)}\n${renderEvidence(projectLlmDateTimes({
          opportunity: "Move to this company itself; its open roles, if any, are listed",
          openRoleCount: c.openRoles?.total ?? 0,
          openRoleTitles: c.openRoles?.titles ?? [],
        }))}`;
      const facts = {
        title: c.roleName, employment: c.employmentType,
        seniority: c.seniorityLevel, location: c.location, workMode: c.workMode,
        compensation: c.salaryRange ?? null,
        estimatedBaseSalary: c.estimatedBaseSalary ?? null, postedAt: c.postedAt,
        description: descriptionText(c.roleDescription),
      };
      return `### role_id: ${roleRefs.get(c.roleId)}\n${renderEvidence(projectLlmDateTimes(facts))}`;
    });
    const name = `company_${sections.length}`;
    sections.push({ name, text: [externalScoringInput({ [name]: evidence }) || `## ${name}`, ...roleSections].join("\n\n") });
  }
  return sections;
}
