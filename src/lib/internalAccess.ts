export const INTERNAL_EMAIL_DOMAIN = "matchharper.com";
export const ATS_ALLOWED_EMAILS = ["hongbeom.heo@gmail.com"] as const;

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function getEmailDomain(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  const atIndex = normalized.lastIndexOf("@");
  if (atIndex === -1) return "";
  return normalized.slice(atIndex + 1);
}

export function isInternalEmail(value: string | null | undefined) {
  return getEmailDomain(value) === INTERNAL_EMAIL_DOMAIN;
}

export function canAccessAts(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    isInternalEmail(normalized) ||
    ATS_ALLOWED_EMAILS.includes(
      normalized as (typeof ATS_ALLOWED_EMAILS)[number]
    )
  );
}
