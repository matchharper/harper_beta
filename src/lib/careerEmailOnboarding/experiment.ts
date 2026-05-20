import {
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
  salt: string;
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

  const bucket = hashString(`${args.salt}:${localId}`) % 100;
  return bucket < 50
    ? CAREER_EMAIL_ONBOARDING_VARIANT
    : CAREER_WEB_ONBOARDING_VARIANT;
}
