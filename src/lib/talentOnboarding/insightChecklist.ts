export type InsightChecklistItem = {
  /** Normalized key for talent_insights.content, e.g. "recent_achievement_hook" */
  key: string;
  /** Korean display label for UI */
  label: string;
  /** One-line description for LLM extraction guidance */
  promptHint: string;
  /** Lower = ask earlier in conversation (1-10) */
  priority: number;
  /** Whether the item is a ranking item */
  isRanking?: boolean;
};

export type OnboardingQuestionChecklistKind =
  | "question"
  | "additional_question"
  | "final_confirmation";

export type OnboardingQuestionChecklistItem = {
  /** Stable key used in talent_calls.state.checklist */
  key: string;
  /** talent_insights.content key to fill when this item stores durable matching memory */
  insightKey?: string;
  /** Korean display label for prompts/UI */
  label: string;
  /** One-line description for LLM extraction and next-question guidance */
  promptHint: string;
  /** Lower = ask earlier in conversation (1-20) */
  priority: number;
  kind: OnboardingQuestionChecklistKind;
};

/**
 * 10 data slots aligned with the Harper career system prompt.
 * Each slot maps to a conversation topic the AI should naturally explore.
 */
const INSIGHT_BACKED_ONBOARDING_ITEMS = [
  {
    key: "search_intensity",
    insightKey: "search_intensity",
    label: "이직 적극도",
    promptHint:
      "How actively the user is exploring a move right now, from casually open to urgently trying to switch within a concrete timeline",
    priority: 1,
    kind: "question",
  },
  {
    key: "location",
    insightKey: "location",
    label: "선호 근무 지역",
    promptHint:
      "The user's preferred work location or region, while gently also checking whether they are open to or considering overseas opportunities",
    priority: 2,
    kind: "question",
  },
  {
    key: "language",
    insightKey: "language",
    label: "외국어 능력",
    promptHint:
      "외국어(대부분의 경우 영어) 실력 파악. 하퍼에 글로벌 기업이 많아서 묻는다는걸 알려주고, 영어에 얼마나 익숙한지, 회의에서 어떤 수준으로 대화가 되는지, 해외 경험이 있는지 물어봐라.",
    priority: 3,
    kind: "question",
  },
  {
    key: "next_scope",
    insightKey: "next_scope",
    label: "다음 역할",
    promptHint:
      "The Role the user wants in the next role, such as current-past role, people leadership(Team manager or C-level), other role if possible, opened to any role",
    priority: 4,
    kind: "question",
  },
  {
    key: "compensation",
    insightKey: "compensation",
    label: "기대 보상 조건",
    promptHint:
      "Whether the user has a minimum acceptable compensation level or 'this much would make sense' expectation for the next opportunity",
    priority: 5,
    kind: "question",
  },
  {
    key: "deal_breakers",
    insightKey: "deal_breakers",
    label: "피하고 싶은 조건",
    promptHint:
      "Clear deal-breakers or conditions that would make the user reject an opportunity even if other parts look attractive",
    priority: 6,
    kind: "question",
  },
  {
    key: "team_style_fit",
    insightKey: "team_style_fit",
    label: "선호하는 회사의 조건",
    promptHint:
      "Preferred company type or conditions, such as startup vs. big tech, investment stage, company-team size, team working style, etc.",
    priority: 7,
    kind: "question",
  },
  {
    key: "must_haves",
    insightKey: "must_haves",
    label: "꼭 있어야 하는 조건",
    promptHint:
      "앞서 확인한 역할, 지역/근무 방식, 보상, 피하고 싶은 조건, 회사/팀 스타일과 별개로 다음 기회를 연결받을 때 반드시 반영해야 하는 조건이나 특별 요청",
    priority: 10,
    kind: "question",
  },
] satisfies OnboardingQuestionChecklistItem[];

export const ONBOARDING_QUESTION_CHECKLIST: OnboardingQuestionChecklistItem[] =
  [
    ...INSIGHT_BACKED_ONBOARDING_ITEMS,
    // {
    //   key: "signature_story",
    //   label: "대표 경험 하나",
    //   promptHint:
    //     "The one career achievement, project, or experience the user most wants to talk about in detail",
    //   priority: 2,
    //   kind: "additional_question",
    // },
    {
      key: "additional_question_one",
      label: "추가 질문 1",
      promptHint:
        "Insight checklist와 별개로 프로필 gap, 직무 depth/preference, 이력 전환/타임라인 등 헤드헌트가 보통 인재측에 물어보는 추가적인 질문",
      priority: 8,
      kind: "additional_question",
    },
    {
      key: "additional_question_two",
      label: "추가 질문 2",
      promptHint:
        "첫 번째 additional question과 다른 프로필 gap, 직무 depth/preference, 이력 전환/타임라인 등 헤드헌트가 보통 인재측에 물어보는 추가적인 질문",
      priority: 9,
      kind: "additional_question",
    },
    {
      key: "final_priority_confirmation",
      label: "마지막 우선순위 확인",
      promptHint:
        "지금까지의 우선순위와 제약을 짧게 정리한 뒤 빠진 것이 있는지 물었고 사용자가 그 확인에 답했는지",
      priority: 11,
      kind: "final_confirmation",
    },
  ];

export const ONBOARDING_QUESTION_MIN_COVERED_COUNT = 8;

export const ONBOARDING_ADDITIONAL_QUESTION_KEYS =
  ONBOARDING_QUESTION_CHECKLIST.filter(
    (item) => item.kind === "additional_question"
  ).map((item) => item.key);

export const ONBOARDING_FINAL_CONFIRMATION_KEY = "final_priority_confirmation";

export const ONBOARDING_QUESTION_CHECKLIST_KEY_SET = new Set(
  ONBOARDING_QUESTION_CHECKLIST.map((item) => item.key)
);

export const ONBOARDING_QUESTION_BY_INSIGHT_KEY = new Map(
  ONBOARDING_QUESTION_CHECKLIST.filter((item) => item.insightKey).map(
    (item) => [item.insightKey as string, item.key]
  )
);

/** Backward-compatible view of durable insight-backed onboarding items. */
export const INSIGHT_CHECKLIST: InsightChecklistItem[] =
  INSIGHT_BACKED_ONBOARDING_ITEMS.map((item) => ({
    key: item.insightKey ?? item.key,
    label: item.label,
    promptHint: item.promptHint,
    priority: item.priority,
  }));

/** Map of checklist key -> Korean label for UI display */
export const INSIGHT_CHECKLIST_LABEL_MAP = new Map(
  INSIGHT_CHECKLIST.map((item) => [item.key, item.label])
);

/** Map of checklist key -> priority index for UI ordering */
export const INSIGHT_CHECKLIST_ORDER_MAP = new Map(
  INSIGHT_CHECKLIST.map((item, index) => [item.key, index])
);

/** Get Korean label for an insight key, falling back to formatted key */
export function getInsightLabel(key: string): string {
  return INSIGHT_CHECKLIST_LABEL_MAP.get(key) ?? formatInsightKeyLabel(key);
}

/** Format a snake_case key as a readable label (fallback for non-checklist keys) */
function formatInsightKeyLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
