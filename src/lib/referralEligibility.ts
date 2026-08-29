import { resolveTalentLocation } from "@/lib/talentLocation";

export type ReferralEntryPointEligibilityInput = {
  currentLocation?: string | null;
  location?: string | null;
  preferredLocale?: string | null;
};

const KOREA_LOCATION_PATTERNS = [
  /\bsouth\s+korea\b/i,
  /\brepublic\s+of\s+korea\b/i,
  /\bkorea\b/i,
  /\bkr\b/i,
  /대한민국/,
  /한국/,
  /서울/,
  /\bseoul\b/i,
  /판교/,
  /\bpangyo\b/i,
  /성남/,
  /\bseongnam\b/i,
  /강남/,
  /\bgangnam\b/i,
  /부산/,
  /\bbusan\b/i,
  /인천/,
  /\bincheon\b/i,
  /대전/,
  /\bdaejeon\b/i,
  /대구/,
  /\bdaegu\b/i,
  /광주/,
  /\bgwangju\b/i,
  /수원/,
  /\bsuwon\b/i,
  /제주/,
  /\bjeju\b/i,
];

export function isKoreanPreferredLocale(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "ko" || normalized === "ko-kr";
}

export function isKoreaLocation(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  if (/\bnorth\s+korea\b/i.test(normalized)) return false;

  return KOREA_LOCATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function canShowReferralEntryPoints(
  input: ReferralEntryPointEligibilityInput
) {
  return (
    isKoreanPreferredLocale(input.preferredLocale) ||
    isKoreaLocation(resolveTalentLocation(input))
  );
}
