export const OPS_ROLE_MEMO_KIND = "manual_note";

export type OpsTalentMemoCandidate = {
  companyName: string | null;
  content: string;
  occurredAt: string | null;
  roleId: string | null;
  roleName: string | null;
  source: "profile" | "role";
  talentId: string;
};

export type OpsTalentMemoPreview = Omit<OpsTalentMemoCandidate, "talentId">;

function memoTimestamp(value: string | null) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildLatestOpsTalentMemoPreviewMap(
  candidates: OpsTalentMemoCandidate[]
) {
  const latestByTalentId = new Map<string, OpsTalentMemoPreview>();

  for (const candidate of candidates) {
    const talentId = candidate.talentId.trim();
    const content = candidate.content.trim();
    if (!talentId || !content) continue;

    const current = latestByTalentId.get(talentId);
    if (
      current &&
      memoTimestamp(current.occurredAt) > memoTimestamp(candidate.occurredAt)
    ) {
      continue;
    }

    latestByTalentId.set(talentId, {
      companyName: candidate.companyName,
      content: content.slice(0, 240),
      occurredAt: candidate.occurredAt,
      roleId: candidate.roleId,
      roleName: candidate.roleName,
      source: candidate.source,
    });
  }

  return latestByTalentId;
}

export function formatOpsTalentMemoRoleContext(
  memo: Pick<OpsTalentMemoPreview, "companyName" | "roleName" | "source">
) {
  if (memo.source !== "role") return null;
  return (
    [memo.companyName, memo.roleName]
      .map((value) => value?.trim() ?? "")
      .filter(Boolean)
      .join(" · ") || null
  );
}
