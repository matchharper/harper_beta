export type OrgCompanyCriterionFitness =
  | "bad"
  | "uncertain"
  | "good"
  | "excellent";

export type OrgCompanyCriteriaEvaluation = {
  content: string;
  fitness: OrgCompanyCriterionFitness;
  name: string;
};

const fitnessValues = new Set<OrgCompanyCriterionFitness>([
  "bad",
  "uncertain",
  "good",
  "excellent",
]);

function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.replaceAll("\u0000", "").trim()
    : "";
}

function normalizedFitness(value: unknown): OrgCompanyCriterionFitness {
  const normalized = normalizedText(value).toLowerCase();
  return fitnessValues.has(normalized as OrgCompanyCriterionFitness)
    ? (normalized as OrgCompanyCriterionFitness)
    : "uncertain";
}

export function normalizeOrgCompanyCriteriaEvaluations(
  value: unknown
): OrgCompanyCriteriaEvaluation[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = normalizedText(record.name);
    const content = normalizedText(record.content);
    if (!name || !content) return [];

    return [
      {
        content,
        fitness: normalizedFitness(record.fitness),
        name,
      },
    ];
  });
}
