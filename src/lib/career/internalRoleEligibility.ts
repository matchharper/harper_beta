export type InternalRoleFitEligibilityRecord = {
  candidate_fit?: unknown;
  company_fit?: unknown;
  human_label?: unknown;
  label?: unknown;
  recommend?: unknown;
  role_fit?: unknown;
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Candidate-visible internal-role eligibility shared by Career read/action paths.
 *
 * A supported candidate hard-negative is always excluded. Human review otherwise
 * takes precedence. Legacy fit/recommend decisions remain valid while the A/B/C
 * migration is incomplete; new axis-based visibility requires A and C fit and B
 * not unfit.
 */
export function isInternalRoleCandidateVisible(
  fit: InternalRoleFitEligibilityRecord | null | undefined
) {
  if (!fit || normalized(fit.candidate_fit) === "unfit") return false;

  const humanLabel = normalized(fit.human_label);
  if (humanLabel) return humanLabel === "fit";

  return (
    normalized(fit.label) === "fit" ||
    fit.recommend === true ||
    (normalized(fit.role_fit) === "fit" &&
      normalized(fit.company_fit) === "fit")
  );
}

export function isInternalRoleReconsiderationEligible(
  fit: InternalRoleFitEligibilityRecord | null | undefined
) {
  if (
    !fit ||
    normalized(fit.human_label) ||
    normalized(fit.candidate_fit) === "unfit"
  ) {
    return false;
  }

  if (normalized(fit.label) === "hold") return true;

  return (
    normalized(fit.role_fit) === "fit" &&
    normalized(fit.company_fit) === "fit" &&
    normalized(fit.candidate_fit) === "middle"
  );
}

export function hasPendingInternalRoleReconsideration(
  fit:
    | (InternalRoleFitEligibilityRecord & {
        reevaluation_checked_at?: unknown;
        reevaluation_criteria?: unknown;
      })
    | null
    | undefined
) {
  if (
    !fit ||
    !isInternalRoleReconsiderationEligible(fit) ||
    fit.reevaluation_checked_at != null
  ) {
    return false;
  }
  const criteria =
    fit.reevaluation_criteria && typeof fit.reevaluation_criteria === "object"
      ? (fit.reevaluation_criteria as Record<string, unknown>)
      : null;
  return Boolean(normalized(criteria?.new_information));
}

export function isInternalRoleCandidateReadable(
  fit:
    | (InternalRoleFitEligibilityRecord & {
        reevaluation_checked_at?: unknown;
        reevaluation_criteria?: unknown;
      })
    | null
    | undefined
) {
  return (
    isInternalRoleCandidateVisible(fit) ||
    hasPendingInternalRoleReconsideration(fit)
  );
}
