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
export const CAREER_LANDING_HERO_COPY_ABTEST_COOKIE =
  "harper_career_landing_hero_copy_ab_v1";
export const CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A =
  "career_landing_v2_hero_copy_a";
export const CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B =
  "career_landing_v2_hero_copy_b";
export const CAREER_LANDING_HERO_COPY_ABTEST_TYPES = [
  CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A,
  CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B,
] as const;

export type CareerLandingHeroCopyAbtestType =
  (typeof CAREER_LANDING_HERO_COPY_ABTEST_TYPES)[number];

const CAREER_UTM_SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function normalizeCareerUtmSource(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
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
  return normalizeCareerUtmSource(params.get(CAREER_UTM_SOURCE_QUERY_PARAM));
}

export function buildCareerUtmUrl(source: string) {
  return `https://matchharper.com?source=${encodeURIComponent(source)}`;
}

export function isCareerLandingHeroCopyAbtestType(
  value: string | null | undefined
): value is CareerLandingHeroCopyAbtestType {
  return (
    value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A ||
    value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B
  );
}

export function getRandomCareerLandingHeroCopyAbtestType(): CareerLandingHeroCopyAbtestType {
  return Math.random() < 0.5
    ? CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A
    : CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B;
}

export function resolveCareerLandingHeroCopyAbtestType(
  _value: string | null | undefined
): CareerLandingHeroCopyAbtestType {
  // The hero-copy experiment is closed; overwrite older B cookies with A.
  return CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A;
}

export function usesCareerLandingHeroCopyB(value: string | null | undefined) {
  return value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B;
}

export function getCareerLandingHeroCopyVariantLabel(
  value: string | null | undefined
) {
  if (value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A) return "A";
  if (value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B) return "B";
  if (value === CAREER_LANDING_ABTEST_TYPE) return "Legacy";
  return "Unknown";
}

export function getCareerLandingHeroCopyVariantDescription(
  value: string | null | undefined
) {
  if (value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_A) {
    return "현재 문구: 다음 커리어는 Harper에게 맡기세요.";
  }
  if (value === CAREER_LANDING_HERO_COPY_ABTEST_TYPE_B) {
    return "주석 문구: Harper가 다음 커리어로 적합한 역할을 찾고...";
  }
  if (value === CAREER_LANDING_ABTEST_TYPE) {
    return "기존 career_landing_v1 로그";
  }
  return "알 수 없는 abtest_type";
}
