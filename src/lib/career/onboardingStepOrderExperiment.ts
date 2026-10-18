export const CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT =
  "career_onboarding_step_order_v1" as const;
export const CAREER_ONBOARDING_STEP_ORDER_EXPOSURE_EVENT =
  "career_onboarding_step_order_exposed" as const;

export const PROFILE_FIRST_VARIANT = "profile_first" as const;
export const VISIBILITY_FIRST_VARIANT = "visibility_first" as const;

export type CareerOnboardingStepOrderVariant =
  | typeof PROFILE_FIRST_VARIANT
  | typeof VISIBILITY_FIRST_VARIANT;

export type CareerOnboardingStepKind =
  | "basic"
  | "engagement"
  | "profile"
  | "visibility";

// The experiment is retired; all onboarding uses B (visibility first).
export function getCareerOnboardingStepOrder(): readonly CareerOnboardingStepKind[] {
  return ["basic", "engagement", "visibility", "profile"];
}
