export const INTERNAL_EMAIL_DOMAIN = "matchharper.com";
export const ADDITIONAL_INTERNAL_ALLOWED_EMAILS = [
  "hongbeom.heo@gmail.com",
  "yijunlee.000@gmail.com",
  "khj605123@gmail.com",
] as const;
export const CAREER_TRANSLATION_INSPECT_ALLOWED_EMAILS = [
  "khj605123@gmail.com",
  "khj6051@optimizerai.xyz",
] as const;

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function getEmailDomain(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return "";
  return normalized.slice(atIndex + 1);
}

export function isInternalEmail(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    getEmailDomain(normalized) === INTERNAL_EMAIL_DOMAIN ||
    ADDITIONAL_INTERNAL_ALLOWED_EMAILS.includes(
      normalized as (typeof ADDITIONAL_INTERNAL_ALLOWED_EMAILS)[number]
    )
  );
}

export function canInspectCareerTranslations(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    getEmailDomain(normalized) === INTERNAL_EMAIL_DOMAIN ||
    CAREER_TRANSLATION_INSPECT_ALLOWED_EMAILS.includes(
      normalized as (typeof CAREER_TRANSLATION_INSPECT_ALLOWED_EMAILS)[number]
    )
  );
}
