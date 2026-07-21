import {
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ALLOCATION_PERCENT,
  CAREER_SIGNUP_FLOW_EXPERIMENT_ID,
  CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE,
  CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE,
  CAREER_EMAIL_ONBOARDING_VARIANT,
  CAREER_WEB_ONBOARDING_VARIANT,
} from "@/lib/careerEmailOnboarding/constants";

export type CareerOnboardingLandingVariant =
  | typeof CAREER_EMAIL_ONBOARDING_VARIANT
  | typeof CAREER_WEB_ONBOARDING_VARIANT;

const EMAIL_OVERRIDE_VALUES = new Set(["email", "email_onboarding", "mail"]);
const WEB_OVERRIDE_VALUES = new Set(["web", "web_onboarding", "control"]);

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveCareerOnboardingLandingVariant(args: {
  localId: string;
  override?: string | null;
  salt?: string;
}): CareerOnboardingLandingVariant {
  const override = String(args.override ?? "")
    .trim()
    .toLowerCase();

  if (EMAIL_OVERRIDE_VALUES.has(override)) {
    return CAREER_EMAIL_ONBOARDING_VARIANT;
  }
  if (WEB_OVERRIDE_VALUES.has(override)) {
    return CAREER_WEB_ONBOARDING_VARIANT;
  }

  const localId = String(args.localId ?? "").trim();
  if (!localId) return CAREER_WEB_ONBOARDING_VARIANT;

  const bucket =
    hashString(`${args.salt || CAREER_SIGNUP_FLOW_EXPERIMENT_ID}:${localId}`) %
    100;
  return bucket < CAREER_SIGNUP_FLOW_EMAIL_FIRST_ALLOCATION_PERCENT
    ? CAREER_EMAIL_ONBOARDING_VARIANT
    : CAREER_WEB_ONBOARDING_VARIANT;
}

export function getCareerSignupFlowAbtestType(
  variant: CareerOnboardingLandingVariant
) {
  return variant === CAREER_EMAIL_ONBOARDING_VARIANT
    ? CAREER_SIGNUP_FLOW_EMAIL_FIRST_ABTEST_TYPE
    : CAREER_SIGNUP_FLOW_CONTROL_ABTEST_TYPE;
}
