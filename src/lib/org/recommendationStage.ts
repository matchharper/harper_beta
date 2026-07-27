export type OrgImplicitAcceptanceStage = "accepted" | "connected";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function getOrgImplicitAcceptanceStage(args: {
  connectedByOrgAction: boolean;
  feedback: string | null | undefined;
  includeInternalAccepted: boolean;
  isInternalRecommendation: boolean;
  savedStage: string | null | undefined;
}): OrgImplicitAcceptanceStage | null {
  if (!args.isInternalRecommendation) return null;

  const feedback = normalizeText(args.feedback);
  const savedStage = normalizeText(args.savedStage);
  const accepted =
    feedback === "like" || feedback === "positive" || savedStage === "accepted";

  if (!accepted) return null;
  if (args.connectedByOrgAction) return "connected";
  return args.includeInternalAccepted ? "accepted" : null;
}
