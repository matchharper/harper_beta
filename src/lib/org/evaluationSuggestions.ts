import {
  companyCriterionFitnessLabel,
  type OrgCompanyCriteriaEvaluation,
  type OrgCompanyCriterionFitness,
} from "@/lib/org/companyCriteriaEvaluations";

const WEAK_FIT_ORDER: Partial<Record<OrgCompanyCriterionFitness, number>> = {
  bad: 0,
  conflict: 1,
  limited: 2,
  uncertain: 3,
};

/**
 * Reasons taken from this candidate's own criterion grades, weakest first,
 * e.g. "대규모 트래픽 경험 · 맞지 않음". They reuse Harper's existing
 * evaluation; nothing new is judged here.
 */
export function suggestOrgStopReasons(
  evaluations: OrgCompanyCriteriaEvaluation[] | null | undefined,
  locale: "ko" | "en"
) {
  return Array.from(
    new Set(
      (evaluations ?? [])
        .filter(
          (evaluation) =>
            !evaluation.pending &&
            WEAK_FIT_ORDER[evaluation.fitness] !== undefined
        )
        .sort(
          (left, right) =>
            (WEAK_FIT_ORDER[left.fitness] ?? 9) -
            (WEAK_FIT_ORDER[right.fitness] ?? 9)
        )
        .map(
          (evaluation) =>
            `${evaluation.name} · ${companyCriterionFitnessLabel(evaluation.fitness, locale)}`
        )
    )
  );
}
