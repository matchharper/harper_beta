export type OrgLocale = "ko" | "en";

export function isOrgLocale(value: unknown): value is OrgLocale {
  return value === "ko" || value === "en";
}

export function resolveOrgLocale(
  browserLanguage: string | null | undefined,
  countryCode?: string | null
): OrgLocale {
  const language = browserLanguage?.trim().split(/[-_]/)[0]?.toLowerCase();
  if (language) return language === "ko" ? "ko" : "en";
  return countryCode?.trim().toUpperCase() === "KR" ? "ko" : "en";
}

export function getBrowserLanguage(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.languages?.[0] || navigator.language || null;
}
