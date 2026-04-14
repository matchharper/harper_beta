export const TALENT_NETWORK_LOCAL_ID_KEY = "harper_talent_network_local_id";
export const TALENT_NETWORK_LAST_VISIT_AT_KEY =
  "harper_talent_network_last_visit_at";
// Use a fresh storage key so the closed v1 assignment does not bleed into v2.
export const TALENT_NETWORK_ABTEST_TYPE_KEY =
  "harper_talent_network_abtest_type_v2";
export const TALENT_NETWORK_LEGACY_ABTEST_TYPE = "talent_network_v1";
export const TALENT_NETWORK_ABTEST_TYPE_A_V1 = "talent_network_a_v1";
export const TALENT_NETWORK_ABTEST_TYPE_B_V1 = "talent_network_b_v1";
export const TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT =
  "talent_network_b_v1_rollout";
export const TALENT_NETWORK_ABTEST_TYPE_A = "talent_network_a_v2";
export const TALENT_NETWORK_ABTEST_TYPE_B = "talent_network_b_v2";
export const TALENT_NETWORK_ABTEST_TYPES = [
  TALENT_NETWORK_ABTEST_TYPE_A,
  TALENT_NETWORK_ABTEST_TYPE_B,
] as const;

// v2 A/B experiment is active. Switch this to "rollout" after selecting a winner.
export const TALENT_NETWORK_ACTIVE_MODE = "experiment" as const;
export const TALENT_NETWORK_ACTIVE_ROLLOUT_TYPE =
  TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT;
export const TALENT_NETWORK_ANALYTICS_ABTEST_TYPES = [
  TALENT_NETWORK_LEGACY_ABTEST_TYPE,
  TALENT_NETWORK_ABTEST_TYPE_A_V1,
  TALENT_NETWORK_ABTEST_TYPE_B_V1,
  TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT,
  ...TALENT_NETWORK_ABTEST_TYPES,
] as const;
export type TalentNetworkAbtestType =
  (typeof TALENT_NETWORK_ABTEST_TYPES)[number];
export type TalentNetworkAssignmentType =
  (typeof TALENT_NETWORK_ANALYTICS_ABTEST_TYPES)[number];
export const TALENT_NETWORK_CLICK_EVENT_PREFIX = "talent_network_click_";
export const TALENT_NETWORK_SUBMIT_COMPLETED_EVENT =
  "talent_network_submit_completed";
export const TALENT_NETWORK_PROFILE_IDENTITY_COMPLETED_EVENT =
  "talent_network_onboarding_step_1_name_email_completed";

export const TALENT_NETWORK_ONBOARDING_STEPS = [
  {
    step: 0,
    label: "시작 화면",
    eventType: "talent_network_onboarding_step_0_intro",
  },
  {
    step: 1,
    label: "기본 정보 / 링크",
    eventType: "talent_network_onboarding_step_1_profile",
  },
  {
    step: 2,
    label: "핵심 임팩트",
    eventType: "talent_network_onboarding_step_2_impact",
  },
  {
    step: 3,
    label: "Engagement / 이직 의향",
    eventType: "talent_network_onboarding_step_3_engagement",
  },
  {
    step: 4,
    label: "선호 지역",
    eventType: "talent_network_onboarding_step_4_location",
  },
  {
    step: 5,
    label: "원하는 기회",
    eventType: "talent_network_onboarding_step_5_opportunity",
  },
  {
    step: 6,
    label: "제출 직전",
    eventType: "talent_network_onboarding_step_6_ready",
  },
] as const;

export const TALENT_NETWORK_ONBOARDING_COMPARISON_STEPS: Array<{
  key: string;
  step: number;
  label: string;
  eventType: string;
}> = [
  {
    key: TALENT_NETWORK_ONBOARDING_STEPS[0].eventType,
    step: TALENT_NETWORK_ONBOARDING_STEPS[0].step,
    label: TALENT_NETWORK_ONBOARDING_STEPS[0].label,
    eventType: TALENT_NETWORK_ONBOARDING_STEPS[0].eventType,
  },
  {
    key: TALENT_NETWORK_ONBOARDING_STEPS[1].eventType,
    step: TALENT_NETWORK_ONBOARDING_STEPS[1].step,
    label: TALENT_NETWORK_ONBOARDING_STEPS[1].label,
    eventType: TALENT_NETWORK_ONBOARDING_STEPS[1].eventType,
  },
  {
    key: TALENT_NETWORK_PROFILE_IDENTITY_COMPLETED_EVENT,
    step: 1,
    label: "이름 / 이메일 입력 완료",
    eventType: TALENT_NETWORK_PROFILE_IDENTITY_COMPLETED_EVENT,
  },
  ...TALENT_NETWORK_ONBOARDING_STEPS.slice(2).map((item) => ({
    key: item.eventType,
    step: item.step,
    label: item.label,
    eventType: item.eventType,
  })),
];

export const getTalentNetworkOnboardingStepEventType = (step: number) =>
  TALENT_NETWORK_ONBOARDING_STEPS.find((item) => item.step === step)?.eventType;

export const isTalentNetworkAbtestType = (
  value: string | null | undefined
): value is TalentNetworkAbtestType =>
  value === TALENT_NETWORK_ABTEST_TYPE_A ||
  value === TALENT_NETWORK_ABTEST_TYPE_B;

export const resolveTalentNetworkAssignmentType = (
  value: string | null | undefined
): TalentNetworkAssignmentType =>
  isTalentNetworkAbtestType(value) ? value : getRandomTalentNetworkAbtestType();

export const getRandomTalentNetworkAbtestType = (): TalentNetworkAbtestType =>
  Math.random() < 0.5
    ? TALENT_NETWORK_ABTEST_TYPE_A
    : TALENT_NETWORK_ABTEST_TYPE_B;

export const usesTalentNetworkAExperience = (
  value: string | null | undefined
) =>
  value === TALENT_NETWORK_ABTEST_TYPE_A_V1 ||
  value === TALENT_NETWORK_ABTEST_TYPE_A;

export const usesTalentNetworkBExperience = (
  value: string | null | undefined
) =>
  value === TALENT_NETWORK_ABTEST_TYPE_B_V1 ||
  value === TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT ||
  value === TALENT_NETWORK_ABTEST_TYPE_B;

export const getTalentNetworkVariantLabel = (
  value: string | null | undefined
) =>
  value === TALENT_NETWORK_ABTEST_TYPE_A_V1
    ? "A v1"
    : value === TALENT_NETWORK_ABTEST_TYPE_B_V1
      ? "B v1"
      : value === TALENT_NETWORK_ABTEST_TYPE_B_V1_ROLLOUT
        ? "B rollout"
        : value === TALENT_NETWORK_ABTEST_TYPE_A
          ? "A v2"
          : value === TALENT_NETWORK_ABTEST_TYPE_B
            ? "B v2"
            : value === TALENT_NETWORK_LEGACY_ABTEST_TYPE
              ? "Legacy"
              : "Unknown";

export const createTalentNetworkLocalId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `network_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};
