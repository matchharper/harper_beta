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

export function assignCareerOnboardingStepOrder(
  userId?: string | null
): CareerOnboardingStepOrderVariant {
  const normalizedUserId = userId?.trim().toLowerCase();
  if (!normalizedUserId) return PROFILE_FIRST_VARIANT;

  // A versioned user-level bucket keeps the same order across visits and devices.
  let hash = 0x811c9dc5;
  const input = `${CAREER_ONBOARDING_STEP_ORDER_EXPERIMENT}:${normalizedUserId}`;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0 < 0x80000000
    ? PROFILE_FIRST_VARIANT
    : VISIBILITY_FIRST_VARIANT;
}

export function getCareerOnboardingStepOrder(
  variant: CareerOnboardingStepOrderVariant
): readonly CareerOnboardingStepKind[] {
  return variant === VISIBILITY_FIRST_VARIANT
    ? ["basic", "engagement", "visibility", "profile"]
    : ["basic", "engagement", "profile", "visibility"];
}
