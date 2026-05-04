export type CareerMobileEntryReason = "magic_link" | "post_signup";

export const CAREER_MOBILE_ENTRY_QUERY_PARAM = "careerEntry";

const CAREER_PATH_PREFIX = "/career";

const getFirstQueryValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }

  return typeof value === "string" ? value : "";
};

const normalizeEntryReason = (
  value: string
): CareerMobileEntryReason | null => {
  const normalized = value.trim().toLowerCase().replace(/-/g, "_");

  if (normalized === "magic" || normalized === "magic_link") {
    return "magic_link";
  }

  if (normalized === "signup" || normalized === "post_signup") {
    return "post_signup";
  }

  return null;
};

export const isCareerMobileBlockedPath = (pathname: string) =>
  pathname === "/career_login" || pathname.startsWith(CAREER_PATH_PREFIX);

export const resolveCareerMobileEntryReason = (
  query: Record<string, unknown>
): CareerMobileEntryReason | null => {
  const explicitReason = normalizeEntryReason(
    getFirstQueryValue(query[CAREER_MOBILE_ENTRY_QUERY_PARAM])
  );
  if (explicitReason) return explicitReason;

  const authType = normalizeEntryReason(getFirstQueryValue(query.type));
  if (authType) return authType;

  if (getFirstQueryValue(query.invite)) {
    return "magic_link";
  }

  return null;
};

export const appendCareerMobileEntryReason = (
  href: string,
  reason: CareerMobileEntryReason
) => {
  const isAbsoluteHref = /^[a-z][a-z0-9+.-]*:\/\//i.test(href);
  const url = new URL(href, "https://harper.local");

  if (!isCareerMobileBlockedPath(url.pathname)) {
    return href;
  }

  url.searchParams.set(CAREER_MOBILE_ENTRY_QUERY_PARAM, reason);

  if (isAbsoluteHref) {
    return url.toString();
  }

  return `${url.pathname}${url.search}${url.hash}`;
};
