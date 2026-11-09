import { careerT } from "@/lib/career/translatedCareerMessage";
export type InsightChecklistItem = {
  /** Compatibility key for an onboarding-backed Brief, e.g. "recent_achievement_hook" */
  key: string;
  /** Korean display label for UI */
  label: string;
  /** One-line description for LLM extraction guidance */
  promptHint: string;
  /** Stable display order for stored Briefs */
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
  /** Compatibility Brief key filled when this onboarding item stores durable context */
  insightKey?: string;
  /** Other durable insight keys intentionally covered by the same user question */
  relatedInsightKeys?: readonly string[];
  /** Korean display label for prompts/UI */
  label: string;
  /** One-line description for LLM extraction and next-question guidance */
  promptHint: string;
  /** Stable display order, not a required question sequence */
  priority: number;
  kind: OnboardingQuestionChecklistKind;
};

export type OnboardingChecklistLocationContext =
  | string
  | {
      current_location?: string | null;
      currentLocation?: string | null;
      location?: string | null;
    }
  | null
  | undefined;

const MUST_HAVES_INSIGHT_ITEM = {
  key: "must_haves",
  label: "꼭 있어야 하는 조건",
  promptHint:
    "다음 역할과 함께 확인한, 이후 기회를 연결할 때 반드시 반영해야 하는 조건이나 특별 요청",
  priority: 3.1,
} satisfies InsightChecklistItem;

const CROSS_BORDER_WORK_AUTHORIZATION_ONBOARDING_ITEM = {
  key: "cross_border_work_authorization",
  insightKey: "cross_border_work_authorization",
  label: "거주국 외 국가의 근무 자격",
  promptHint:
    "Existing work authorization or a need for sponsorship when relevant to the countries the user wants to work in. Do not infer nationality or authorization from residence.",
  priority: 5,
  kind: "question",
} satisfies OnboardingQuestionChecklistItem;

/** Common onboarding topics. Every location receives this same checklist. */
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
      "Where the user would consider working, including any remote, relocation or cross-border constraints relevant to their search",
    priority: 2,
    kind: "question",
  },
  {
    key: "next_scope",
    insightKey: "next_scope",
    relatedInsightKeys: [MUST_HAVES_INSIGHT_ITEM.key],
    label: "다음 역할과 꼭 필요한 조건",
    promptHint:
      "The work, responsibilities or direction the user wants next, and any conditions essential to considering an opportunity.",
    priority: 3,
    kind: "question",
  },
  {
    key: "compensation",
    insightKey: "compensation",
    label: "기대 보상 조건",
    promptHint:
      "The compensation level or range that would make a next opportunity worth considering, and what that expectation means (such as currency and base versus total compensation when relevant). A stated priority alone does not describe an expected level; an explicitly undecided or private expectation is also useful context.",
    priority: 4,
    kind: "question",
  },
  CROSS_BORDER_WORK_AUTHORIZATION_ONBOARDING_ITEM,
  {
    key: "language",
    insightKey: "language",
    label: "외국어 능력",
    promptHint:
      "Languages the user can work in and their practical communication ability, to understand which teams they could work with. Residence, nationality or employer alone does not establish proficiency.",
    priority: 6,
    kind: "question",
  },
  {
    key: "deal_breakers",
    insightKey: "deal_breakers",
    label: "피하고 싶은 조건",
    promptHint:
      "Clear deal-breakers or conditions that would make the user reject an opportunity even if other parts look attractive",
    priority: 7,
    kind: "question",
  },
  {
    key: "team_style_fit",
    insightKey: "team_style_fit",
    label: "선호하는 회사의 조건",
    promptHint:
      "사용자가 어떤 회사나 팀을 매력적으로 느끼는지와 그 이유. 회사 인지도, 사업, 일하는 방식 등 사용자가 중요하게 여기는 기준을 이해한다.",
    priority: 8,
    kind: "question",
  },
] satisfies OnboardingQuestionChecklistItem[];

const ADDITIONAL_QUESTION_ONE_ITEM = {
  key: "additional_question_one",
  label: "추가 질문 1",
  promptHint:
    "Insight checklist와 별개로 프로필 gap, 직무 depth/preference, 이력 전환/타임라인 등 헤드헌트가 보통 인재측에 물어보는 추가적인 질문",
  priority: 9,
  kind: "additional_question",
} satisfies OnboardingQuestionChecklistItem;

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
    ADDITIONAL_QUESTION_ONE_ITEM,
  ];

/** The short first conversation only needs enough context to begin searching. */
export const ONBOARDING_REQUIRED_QUESTION_KEYS = [
  "search_intensity",
  "location",
  "next_scope",
  "compensation",
  "language",
  "team_style_fit",
] as const;

export const ONBOARDING_QUESTION_MIN_COVERED_COUNT =
  ONBOARDING_REQUIRED_QUESTION_KEYS.length;

const ALL_ONBOARDING_QUESTION_CHECKLIST = ONBOARDING_QUESTION_CHECKLIST;

export function getOnboardingQuestionChecklist(
  _context?: OnboardingChecklistLocationContext
): OnboardingQuestionChecklistItem[] {
  return ONBOARDING_QUESTION_CHECKLIST;
}

export function getOnboardingAdditionalQuestionKeys(
  context?: OnboardingChecklistLocationContext
) {
  return getOnboardingQuestionChecklist(context)
    .filter((item) => item.kind === "additional_question")
    .map((item) => item.key);
}

export function getOnboardingRequiredQuestionKeys(
  _context?: OnboardingChecklistLocationContext
) {
  return [...ONBOARDING_REQUIRED_QUESTION_KEYS];
}

export function getOnboardingQuestionInsightKeys(
  item: OnboardingQuestionChecklistItem
) {
  return [item.insightKey, ...(item.relatedInsightKeys ?? [])].filter(
    (key): key is string => Boolean(key)
  );
}

export function getOnboardingQuestionByInsightKey(
  context?: OnboardingChecklistLocationContext
) {
  return new Map(
    getOnboardingQuestionChecklist(context).flatMap((item) =>
      getOnboardingQuestionInsightKeys(item).map(
        (insightKey) => [insightKey, item.key] as const
      )
    )
  );
}

export const ONBOARDING_ADDITIONAL_QUESTION_KEYS =
  ONBOARDING_QUESTION_CHECKLIST.filter(
    (item) => item.kind === "additional_question"
  ).map((item) => item.key);

/** Read historical coverage without making confirmation a current question. */
export const ONBOARDING_FINAL_CONFIRMATION_KEY = "final_priority_confirmation";

export const ONBOARDING_QUESTION_CHECKLIST_KEY_SET = new Set(
  [
    ...ALL_ONBOARDING_QUESTION_CHECKLIST.map((item) => item.key),
    ONBOARDING_FINAL_CONFIRMATION_KEY,
  ]
);

export const ONBOARDING_QUESTION_BY_INSIGHT_KEY = new Map(
  ALL_ONBOARDING_QUESTION_CHECKLIST.flatMap((item) =>
    getOnboardingQuestionInsightKeys(item).map(
      (insightKey) => [insightKey, item.key] as const
    )
  )
);

export function getInsightChecklist(
  _context?: OnboardingChecklistLocationContext
): InsightChecklistItem[] {
  return INSIGHT_CHECKLIST;
}

/** Backward-compatible view of durable insight-backed onboarding items. */
export const INSIGHT_CHECKLIST: InsightChecklistItem[] = [
  ...INSIGHT_BACKED_ONBOARDING_ITEMS.map((item) => ({
    key: item.insightKey ?? item.key,
    label:
      item.key === "next_scope"
        ? careerT(
            "ko",
            "career.profile.career_talent_profile_panel.1axs5u2",
            "다음 역할"
          )
        : item.label,
    promptHint:
      item.key === "next_scope"
        ? "사용자가 다음 기회에서 원하는 역할, 책임 범위, 직무 방향"
        : item.promptHint,
    priority: item.priority,
  })),
  MUST_HAVES_INSIGHT_ITEM,
].sort((left, right) => left.priority - right.priority);

/** Map of checklist key -> Korean label for UI display */
export const INSIGHT_CHECKLIST_LABEL_MAP = new Map([
  ...INSIGHT_CHECKLIST.map((item) => [item.key, item.label] as const),
]);

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
