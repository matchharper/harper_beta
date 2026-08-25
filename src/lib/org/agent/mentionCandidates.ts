import type { OrgAgentMentionCandidate } from "@/lib/org/agent/types";

function normalizedText(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function matchesQuery(candidate: OrgAgentMentionCandidate, query: string) {
  if (!query) return true;
  return [
    candidate.label,
    candidate.headline,
    candidate.roleName,
    candidate.stageLabel,
    candidate.subtitle,
  ].some((value) => normalizedText(value).includes(query));
}

export function filterOrgAgentMentionCandidates(args: {
  candidates: OrgAgentMentionCandidate[];
  query?: string | null;
  roleId?: string | null;
}) {
  const query = normalizedText(args.query);
  const roleId = String(args.roleId ?? "").trim();
  const currentRoleCandidates: OrgAgentMentionCandidate[] = [];
  const otherRoleCandidates: OrgAgentMentionCandidate[] = [];
  const seenTalentIds = new Set<string>();

  const sortedCandidates = [...args.candidates].sort((left, right) => {
    const leftIsCurrent = Boolean(roleId && left.roleId === roleId);
    const rightIsCurrent = Boolean(roleId && right.roleId === roleId);
    if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
    return right.recommendedAt.localeCompare(left.recommendedAt);
  });

  for (const candidate of sortedCandidates) {
    if (
      seenTalentIds.has(candidate.talentId) ||
      !matchesQuery(candidate, query)
    ) {
      continue;
    }
    seenTalentIds.add(candidate.talentId);
    const target =
      roleId && candidate.roleId === roleId
        ? currentRoleCandidates
        : otherRoleCandidates;
    target.push(candidate);
  }

  return [...currentRoleCandidates, ...otherRoleCandidates];
}
