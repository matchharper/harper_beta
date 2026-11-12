export function normalizeRecommendationFeedback(
  value: string | null | undefined
) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "like" || normalized === "positive") return "positive";
  if (normalized === "dislike" || normalized === "negative") return "negative";
  return null;
}

export function isInternalOpportunity(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return (
    normalized === "internal_recommendation" || normalized === "intro_request"
  );
}

export function isCandidateRequestedRecommendation(evidence: unknown) {
  // The request tool records this origin only when it creates a recommendation.
  return (
    Array.isArray(evidence) &&
    evidence.some(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        entry.source === "candidate_request"
    )
  );
}
