export const TALENT_NETWORK_LOCAL_ID_KEY = "harper_talent_network_local_id";
export const TALENT_NETWORK_LAST_VISIT_AT_KEY =
  "harper_talent_network_last_visit_at";
export const TALENT_NETWORK_LOG_ABTEST_TYPE = "talent_network_v1";

export const createTalentNetworkLocalId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `network_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};
