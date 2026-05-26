export const CAREER_UTM_SOURCE_QUERY_PARAM = "source";
export const CAREER_UTM_DEFAULT_SOURCE = "career";
export const CAREER_UTM_SOURCE_MAX_LENGTH = 80;
export const CAREER_UTM_DESCRIPTION_MAX_LENGTH = 500;
export const CAREER_UTM_SOURCE_STORAGE_KEY = "harper_career_utm_source_v1";
export const CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX =
  "harper_career_utm_login_logged_v1";
export const CAREER_LANDING_LOCAL_ID_STORAGE_KEY =
  "harper_career_landing_id_v1";
export const CAREER_LANDING_ABTEST_TYPE = "career_landing_v1";

const CAREER_UTM_SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function normalizeCareerUtmSource(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > CAREER_UTM_SOURCE_MAX_LENGTH) return null;
  if (!CAREER_UTM_SOURCE_PATTERN.test(normalized)) return null;
  return normalized;
}

export function normalizeCareerUtmDescription(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized.slice(0, CAREER_UTM_DESCRIPTION_MAX_LENGTH);
}

export function resolveCareerUtmSource(value: unknown) {
  return normalizeCareerUtmSource(value) ?? CAREER_UTM_DEFAULT_SOURCE;
}

export function readCareerUtmSourceFromSearch(search: string) {
  const params = new URLSearchParams(search);
  return normalizeCareerUtmSource(
    params.get(CAREER_UTM_SOURCE_QUERY_PARAM)
  );
}

export function buildCareerUtmUrl(source: string) {
  return `https://matchharper.com?source=${encodeURIComponent(source)}`;
}
