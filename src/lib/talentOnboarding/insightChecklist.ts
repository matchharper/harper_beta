import { careerT } from "@/lib/career/translatedCareerMessage";
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
  /** Other durable insight keys intentionally covered by the same user question */
  relatedInsightKeys?: readonly string[];
  /** Korean display label for prompts/UI */
  label: string;
  /** One-line description for LLM extraction and next-question guidance */
  promptHint: string;
  /** Lower = ask earlier in conversation (1-20) */
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
    "Use the user's explicit current location to determine its country, then confirm nationality with the assertive wording '[location-country] 국적이신 거죠?' Do not soften this into an open-ended nationality question. Continue by asking whether the user already has citizenship, permanent residency, or another valid work authorization in any country other than that location country. Briefly explain that Harper also explores global opportunities and some roles require existing local work authorization. A natural Korean example is: '현재 [location-country]에 계신 것으로 확인되는데, [location-country] 국적이신 거죠? 하퍼가 글로벌 기회도 함께 살펴보고 있고 일부 역할은 현지 근무 자격이 필요해요. 혹시 [location-country] 외에 시민권이나 영주권처럼 이미 일할 수 있는 자격을 가진 나라가 있다면 알려주세요.' If the current location is unavailable, ask the user's nationality directly before asking about other countries. Keep it factual and do not expand into broad visa advice unless the user asks.",
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
      "The user's preferred work location or region, while gently also checking whether they are open to or considering overseas opportunities",
    priority: 2,
    kind: "question",
  },
  {
    key: "next_scope",
    insightKey: "next_scope",
    relatedInsightKeys: [MUST_HAVES_INSIGHT_ITEM.key],
    label: "다음 역할과 꼭 필요한 조건",
    promptHint:
      "Ask in one natural question what role, responsibility, or direction the user wants next and whether there are any non-negotiable requirements or special requests that Harper must apply when exploring opportunities. Keep the desired role in next_scope and any separate hard requirement in must_haves.",
    priority: 3,
    kind: "question",
  },
  {
    key: "compensation",
    insightKey: "compensation",
    label: "기대 보상 조건",
    promptHint:
      "Whether the user has a minimum acceptable compensation level or 'this much would make sense' expectation for the next opportunity",
    priority: 4,
    kind: "question",
  },
  CROSS_BORDER_WORK_AUTHORIZATION_ONBOARDING_ITEM,
  {
    key: "language",
    insightKey: "language",
    label: "외국어 능력",
    promptHint:
      "Ask which languages the user can use in work conversations, the level for each language, and concrete situations where they can communicate at that level. Ask for examples such as 1:1 meetings, team meetings, interviews, technical/product discussions, negotiation, client communication, or async writing. Briefly explain that Harper asks because many opportunities involve global teams. If the user's explicit current residence is Hong Kong or Indonesia, explicitly cover English and Chinese rather than treating 'Chinese' as one language: distinguish Mandarin/Putonghua and Cantonese, and for Indonesia also ask about Indonesian when it is not already clear. Never infer proficiency from residence, nationality, education, or employer.",
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
      "Preferred company type or conditions, such as startup vs. big tech, investment stage, company-team size, team working style, etc.",
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

const FINAL_PRIORITY_CONFIRMATION_ITEM = {
  key: "final_priority_confirmation",
  label: "마지막 우선순위 확인 혹은 종료 확인",
  promptHint:
    "지금까지의 우선순위와 제약을 짧게 정리한 뒤 빠진 것이 있는지 물었고 사용자가 그 확인에 답했는지 혹은 사용자가 종료를 요청했는지",
  priority: 10,
  kind: "final_confirmation",
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
    FINAL_PRIORITY_CONFIRMATION_ITEM,
  ];

export const ONBOARDING_QUESTION_MIN_COVERED_COUNT =
  ONBOARDING_QUESTION_CHECKLIST.length;

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
  return [CROSS_BORDER_WORK_AUTHORIZATION_ONBOARDING_ITEM.key];
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

export const ONBOARDING_FINAL_CONFIRMATION_KEY = "final_priority_confirmation";

export const ONBOARDING_QUESTION_CHECKLIST_KEY_SET = new Set(
  ALL_ONBOARDING_QUESTION_CHECKLIST.map((item) => item.key)
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
