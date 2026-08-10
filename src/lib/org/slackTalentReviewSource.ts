import type { SlackTalentReviewCandidateRef } from "./slackTalentReviewView";

const clean = (value: unknown) => String(value ?? "").trim();
const nullable = (value: unknown) => clean(value) || null;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function candidateRef(value: unknown): SlackTalentReviewCandidateRef | null {
  const row = record(value);
  const displayName = clean(row.displayName);
  const roleId = clean(row.roleId);
  const talentId = clean(row.talentId);
  if (!displayName || !roleId || !talentId) return null;
  return {
    displayName,
    recommendationId: nullable(row.recommendationId),
    roleId,
    talentId,
  };
}

export function orderedSlackTalentReviewCandidates(
  mentions: unknown,
  metadata: unknown
) {
  const refs = Array.isArray(mentions)
    ? mentions.flatMap((item) => {
        const parsed = candidateRef(item);
        return parsed ? [parsed] : [];
      })
    : [];
  const byKey = new Map(
    refs.map((item) => [`${item.roleId}:${item.talentId}`, item])
  );
  const autoIntro = record(record(metadata).autoIntroToCompany);
  const candidateKeys = Array.isArray(autoIntro.candidateKeys)
    ? autoIntro.candidateKeys.map(clean).filter(Boolean)
    : [];
  if (candidateKeys.length > 0) {
    const ordered = candidateKeys.flatMap((key) => {
      const candidate = byKey.get(key);
      return candidate ? [candidate] : [];
    });
    return ordered.length === candidateKeys.length ? ordered : [];
  }

  // Older auto-intro records predate workspace-level candidate keys. They
  // contain one roleId plus candidateIds in delivery order.
  const legacyRoleId = clean(autoIntro.roleId);
  const candidateIds = Array.isArray(autoIntro.candidateIds)
    ? autoIntro.candidateIds.map(clean).filter(Boolean)
    : [];
  if (candidateIds.length === 0) return [];
  const byTalentId = new Map(
    refs
      .filter((item) => !legacyRoleId || item.roleId === legacyRoleId)
      .map((item) => [item.talentId, item])
  );
  const ordered = candidateIds.flatMap((talentId) => {
    const candidate = byTalentId.get(talentId);
    return candidate ? [candidate] : [];
  });
  return ordered.length === candidateIds.length ? ordered : [];
}
