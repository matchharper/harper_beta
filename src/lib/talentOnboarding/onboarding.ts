export const TALENT_MESSAGE_TYPE_ONBOARDING_INTEREST_PROMPT =
  "onboarding_interest_prompt";
export const TALENT_MESSAGE_TYPE_ONBOARDING_STATUS = "onboarding_status";
export const TALENT_MESSAGE_TYPE_ONBOARDING_PAUSE_CLOSE =
  "onboarding_pause_close";

export const TALENT_ONBOARDING_INTEREST_OPTIONS = [
  {
    id: "active_job_search",
    label: "적극적으로 이직을 찾고 있다.",
  },
  {
    id: "open_to_good_opportunities",
    label:
      "이직 생각이 크지 않지만 생각하고 있기 때문에 좋은 기회가 있다면 받고 싶다.",
  },
  {
    id: "not_looking_now",
    label:
      "아예 이직 생각이 없고, 나중에 이직 생각이 생기면 다시 와서 알려주겠다.",
  },
  {
    id: "part_time_or_coffee_chat",
    label: "파트타임/커피챗 등 남는 시간을 활용가능한 기회를 찾고있다.",
  },
] as const;

export type TalentOnboardingInterestOptionId =
  (typeof TALENT_ONBOARDING_INTEREST_OPTIONS)[number]["id"];
