export type InternalRoleFitEligibilityRecord = {
  candidate_fit?: unknown;
  fit_contract_version?: unknown;
  candidate_visible?: unknown;
  priority_review_recommendable?: unknown;
  expires_at?: unknown;
  company_fit?: unknown;
  human_label?: unknown;
  label?: unknown;
  recommend?: unknown;
  role_fit?: unknown;
  evaluated_stage?: unknown;
  input_fingerprint?: unknown;
};

// The database owns the explicit-review rule: an existing candidate selection
// or perfect role/company grades, independent of the fit cache expiry.
export function isInternalRolePriorityReviewRecommendable(
  fit: InternalRoleFitEligibilityRecord | null | undefined
) {
  // 평가 기록이 없으면 아직 정식 추천을 보여줄 수 없음.
  if (!fit) return false;
  if (fit.fit_contract_version === "talent_role_fit_v2") {
    // 새 평가 방식: 저장된 '우선 검토 후 추천 가능 여부'가 true일 때만 가능.
    return fit.priority_review_recommendable === true;
  }
  // 이전 평가 방식: 기존 추천 가능 조건을 그대로 사용.
  return isInternalRoleCandidateVisible(fit);
}

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
  if (!fit) return false;
  if (fit.fit_contract_version === "talent_role_fit_v2") return fit.candidate_visible === true;
  if (normalized(fit.candidate_fit) === "unfit") return false;

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
