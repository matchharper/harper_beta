export const OPS_ROLE_MEMO_KIND = "manual_note";

export type OpsTalentProfileMemoCandidate = {
  content: string;
  occurredAt: string | null;
  talentId: string;
};

export type OpsTalentProfileMemoPreview = Omit<
  OpsTalentProfileMemoCandidate,
  "talentId"
>;

function memoTimestamp(value: string | null) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildLatestOpsTalentProfileMemoPreviewMap(
  candidates: OpsTalentProfileMemoCandidate[]
) {
  const latestByTalentId = new Map<string, OpsTalentProfileMemoPreview>();

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
      content: content.slice(0, 240),
      occurredAt: candidate.occurredAt,
    });
  }

  return latestByTalentId;
}
