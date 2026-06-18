export type SearchEvidencePaper = {
  paper_id?: string | null;
  paper_index?: number | null;
  title?: string | null;
  published_at?: string | null;
  citation_num?: number | null;
};

export type SearchEvidence = {
  type?: string | null;
  paper?: SearchEvidencePaper | null;
} | null;

export type SearchRank = {
  finalScore?: number | null;
  criteriaScore?: number | null;
  suitabilityScore?: number | null;
} | null;

export type RunPageCandidate = {
  id?: string;
  score?: number | string | null;
  criteria_score?: number | string | null;
  suitability_score?: number | string | null;
  evidence?: SearchEvidence | null;
};

export function filterPositiveScoreCandidates<T extends RunPageCandidate>(
  items: T[]
) {
  return items.filter((item) => {
    const score = Number(item?.score);
    if (Number.isNaN(score)) return true;
    return score > 0;
  });
}

export function buildEvidenceMap(
  items: RunPageCandidate[]
): Map<string, SearchEvidence> {
  const out = new Map<string, SearchEvidence>();
  for (const item of items) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    out.set(id, item?.evidence ?? null);
  }
  return out;
}

function toOptionalNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function buildRankMap(items: RunPageCandidate[]): Map<string, SearchRank> {
  const out = new Map<string, SearchRank>();
  for (const item of items) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    out.set(id, {
      finalScore: toOptionalNumber(item?.score),
      criteriaScore: toOptionalNumber(item?.criteria_score),
      suitabilityScore: toOptionalNumber(item?.suitability_score),
    });
  }
  return out;
}

export function getEvidencePaper(evidence?: SearchEvidence | null) {
  if (!evidence || evidence.type !== "paper") return null;
  return evidence.paper ?? null;
}

export function buildEvidencePaperTooltip(evidence?: SearchEvidence | null) {
  const paper = getEvidencePaper(evidence);
  if (!paper?.title) return "";

  const lines = [paper.title];
  if (paper.published_at) lines.push(String(paper.published_at));
  if (paper.citation_num != null) {
    lines.push(`${paper.citation_num} citations`);
  }
  return lines.join("\n");
}

export function buildEvidencePaperMeta(evidence?: SearchEvidence | null) {
  const paper = getEvidencePaper(evidence);
  if (!paper) return "";

  const parts: string[] = [];
  if (paper.published_at) parts.push(String(paper.published_at));
  if (paper.citation_num != null) {
    parts.push(`${paper.citation_num} citations`);
  }
  return parts.join(" · ");
}
