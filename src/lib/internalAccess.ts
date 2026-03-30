export const INTERNAL_EMAIL_DOMAIN = "matchharper.com";

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
