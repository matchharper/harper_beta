const TALENT_NETWORK_REFERRAL_VISIT_LOG_PREFIX =
  "talent_network_referral_visit:";

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
