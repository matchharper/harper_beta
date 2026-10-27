export type OrgCompanyCriterionFitness =
  | "bad"
  | "limited"
  | "conflict"
  | "uncertain"
  | "good"
  | "excellent";

export type OrgCompanyCriteriaEvaluation = {
  content: string;
  fitness: OrgCompanyCriterionFitness;
  name: string;
  score?: number;
  /** Being judged again after the team changed this criterion. */
  pending?: boolean;
};

export function companyCriterionScoreLabel(score: unknown): string | null {
  return typeof score === "number" && Number.isFinite(score)
    ? `${Number(score.toFixed(2))}/100`
    : null;
}

export type OrgCompanyPresentation = {
  tldr: string;
  harperNote: string;
  recommendationReason?: string;
  finalFit: "excellent" | "good" | "borderline" | "uncertain" | "unfit" | null;
  criteriaEvaluations: OrgCompanyCriteriaEvaluation[];
  briefVersion?: string;
  isFromPreviousBrief?: boolean;
};

/** Unknown legacy versions must not be presented as either current or stale. */
export function isCompanyPresentationFromPreviousBrief(
  presentationVersion: unknown,
  currentVersion: unknown
) {
  if (
    typeof presentationVersion !== "string" ||
    !presentationVersion.trim() ||
    typeof currentVersion !== "string" ||
    !currentVersion.trim()
  )
    return undefined;
  return presentationVersion !== currentVersion;
}

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

/** Preserve the scorer's label; these are display translations, not new ratings. */
export function companyCriterionFitnessLabel(
  fitness: OrgCompanyCriterionFitness,
  locale: "ko" | "en"
) {
  if (fitness === "limited")
    return locale === "ko" ? "근거 제한" : "Limited evidence";
  if (fitness === "conflict")
    return locale === "ko" ? "조건 상충" : "Conflicting evidence";
  return companyPresentationFinalFitLabel(
    fitness === "bad" ? "unfit" : fitness,
    locale
  );
}

/** Project only the company-safe report, never internal selection context. */
export function normalizeOrgCompanyPresentation(
  value: unknown
): OrgCompanyPresentation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (typeof report.tldr !== "string") return null;
  const fit = report.finalFit;
  return {
    tldr: report.tldr,
    harperNote:
      typeof report.harper_note === "string"
        ? report.harper_note
        : typeof report.harperNote === "string"
          ? report.harperNote
          : "",
    ...(typeof report.recommendationReason === "string"
      ? { recommendationReason: report.recommendationReason }
      : {}),
    finalFit:
      typeof fit === "string" &&
      ["excellent", "good", "borderline", "uncertain", "unfit"].includes(fit)
        ? (fit as OrgCompanyPresentation["finalFit"])
        : null,
    criteriaEvaluations: normalizeOrgCompanyCriteriaEvaluations(
      report.criteriaEvaluations
    ),
    ...(typeof report.briefVersion === "string" && report.briefVersion
      ? { briefVersion: report.briefVersion }
      : {}),
  };
}

const fitnessValues = new Set<OrgCompanyCriterionFitness>([
  "bad",
  "limited",
  "conflict",
  "uncertain",
  "good",
  "excellent",
]);

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.replaceAll("\u0000", "").trim() : "";
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
    const pending = record.pending === true;
    if (!name || (!content && !pending)) return [];

    return [
      {
        content,
        fitness: normalizedFitness(record.fitness),
        name,
        ...(typeof record.score === "number" && Number.isFinite(record.score)
          ? { score: record.score }
          : {}),
        ...(pending ? { pending: true } : {}),
      },
    ];
  });
}
