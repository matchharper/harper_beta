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

export type OrgCompanyPresentation = {
  tldr: string;
  harperNote: string;
  finalFit: "excellent" | "good" | "borderline" | "uncertain" | "unfit" | null;
  criteriaEvaluations: OrgCompanyCriteriaEvaluation[];
};

export function companyPresentationFinalFitLabel(
  fit: NonNullable<OrgCompanyPresentation["finalFit"]>,
  locale: "ko" | "en"
) {
  const labels = {
    excellent: { ko: "매우 잘 맞음", en: "Excellent fit" },
    good: { ko: "잘 맞음", en: "Good fit" },
    borderline: { ko: "일부 맞음", en: "Partial fit" },
    uncertain: { ko: "확인 필요", en: "More information needed" },
    unfit: { ko: "맞지 않음", en: "Not a fit" },
  };
  return labels[fit][locale];
}

/** Project only the company-safe report, never internal selection context. */
export function normalizeOrgCompanyPresentation(value: unknown): OrgCompanyPresentation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (typeof report.tldr !== "string") return null;
  const fit = report.finalFit;
  return {
    tldr: report.tldr,
    harperNote:
      typeof report.harper_note === "string" ? report.harper_note
        : typeof report.harperNote === "string" ? report.harperNote : "",
    finalFit:
      typeof fit === "string" && ["excellent", "good", "borderline", "uncertain", "unfit"].includes(fit)
        ? fit as OrgCompanyPresentation["finalFit"] : null,
    criteriaEvaluations: normalizeOrgCompanyCriteriaEvaluations(report.criteriaEvaluations),
  };
}

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
