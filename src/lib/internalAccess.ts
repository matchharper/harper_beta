export const INTERNAL_EMAIL_DOMAIN = "matchharper.com";
export const OPS_UTM_VIEWER_EMAILS = [
  "hongbeom.heo@gmail.com",
  "reason.jinny@gmail.com",
  "rnfxlqcjf@naver.com",
  "khj605123@gmail.com",
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

export function isInternalDomainEmail(value: string | null | undefined) {
  return getEmailDomain(value) === INTERNAL_EMAIL_DOMAIN;
}

export function isInternalEmail(value: string | null | undefined) {
  return isInternalDomainEmail(value);
}

export function canViewOpsUtm(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    isInternalDomainEmail(normalized) ||
    OPS_UTM_VIEWER_EMAILS.includes(
      normalized as (typeof OPS_UTM_VIEWER_EMAILS)[number]
    )
  );
}

export function canUseCareerDevControls(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    process.env.NODE_ENV !== "production" ||
    getEmailDomain(normalized) === INTERNAL_EMAIL_DOMAIN ||
    normalized === "hyunbin.bk@gmail.com" ||
    normalized === "khj605123@gmail.com"
  );
}

export function canUseOrgDevControls(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return (
    isInternalDomainEmail(normalized) ||
    normalized === "hyunbin.bk@gmail.com" ||
    normalized === "khj605123@gmail.com"
  );
}

export function canInspectCareerTranslations(value: string | null | undefined) {
  return isInternalDomainEmail(value);
}
