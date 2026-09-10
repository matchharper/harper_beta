const TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX =
  "talent_network_referral_visit:";

export const CAREER_REFERRAL_VIEWED_LOG_TYPE = "career_referral_viewed";
export const CAREER_REFERRAL_LINK_COPIED_LOG_TYPE =
  "career_referral_link_copied";

export const TALENT_NETWORK_REFERRAL_VISIT_ABTEST_TYPE =
  "talent_network_referral_visit_v1";

export function buildTalentNetworkReferralVisitLogType(token: string) {
  const normalizedToken = String(token ?? "").trim();
  return normalizedToken
    ? `${TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX}${normalizedToken}`
    : "";
}

export function isTalentNetworkReferralVisitLogType(
  value: string | null | undefined
) {
  return String(value ?? "").startsWith(
    TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX
  );
}

export function getTalentNetworkReferralTokenFromVisitLogType(
  value: string | null | undefined
) {
  const normalized = String(value ?? "").trim();
  if (!normalized.startsWith(TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX)) {
    return null;
  }

  return (
    normalized.slice(TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX.length).trim() ||
    null
  );
}
