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

type CountryScopedOnboardingCountry = "SG" | "JP" | "AU";

const COUNTRY_SCOPED_ONBOARDING_COUNTRY_TOKENS: Record<
  CountryScopedOnboardingCountry,
  Set<string>
> = {
  SG: new Set(["singapore"]),
  JP: new Set(["japan"]),
  AU: new Set(["australia"]),
};

function getOnboardingLocationContextText(
  context: OnboardingChecklistLocationContext
) {
  if (typeof context === "string") return context;
  if (!context || typeof context !== "object") return "";
  return [
    context.current_location,
    context.currentLocation,
    context.location,
  ]
    .filter((value): value is string => Boolean(value))
    .join(", ");
}

export function getCountryScopedOnboardingCountry(
  context: OnboardingChecklistLocationContext
): CountryScopedOnboardingCountry | null {
  const text = getOnboardingLocationContextText(context)
    .toLocaleLowerCase("en-US")
    .trim();
  if (!text) return null;

  const tokens = text.split(/[^a-z]+/i).filter(Boolean);
  for (const [country, countryTokens] of Object.entries(
    COUNTRY_SCOPED_ONBOARDING_COUNTRY_TOKENS
  ) as Array<[CountryScopedOnboardingCountry, Set<string>]>) {
    if (tokens.some((token) => countryTokens.has(token))) return country;
  }

  return null;
}

export function isCountryScopedOnboardingCountry(
  context: OnboardingChecklistLocationContext
) {
  return Boolean(getCountryScopedOnboardingCountry(context));
}

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
      "Ask which languages the user can use in work conversations, the level for each language, and concrete situations where they can communicate at that level. Ask for examples such as 1:1 meetings, team meetings, interviews, technical/product discussions, negotiation, client communication, or async writing. Briefly explain that Harper asks because many opportunities involve global teams.",
    priority: 3,
    kind: "question",
  },
  {
    key: "next_scope",
    insightKey: "next_scope",
    label: careerT(
      "ko",
      "career.profile.career_talent_profile_panel.1axs5u2",
      "다음 역할"
    ),
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

const ADDITIONAL_QUESTION_ONE_ITEM = {
  key: "additional_question_one",
  label: "추가 질문 1",
  promptHint:
    "Insight checklist와 별개로 프로필 gap, 직무 depth/preference, 이력 전환/타임라인 등 헤드헌트가 보통 인재측에 물어보는 추가적인 질문",
  priority: 8,
  kind: "additional_question",
} satisfies OnboardingQuestionChecklistItem;

const ADDITIONAL_QUESTION_TWO_ITEM = {
  key: "additional_question_two",
  label: "추가 질문 2",
  promptHint:
    "첫 번째 additional question과 다른 프로필 gap, 직무 depth/preference, 이력 전환/타임라인 등 헤드헌트가 보통 인재측에 물어보는 추가적인 질문",
  priority: 9,
  kind: "additional_question",
} satisfies OnboardingQuestionChecklistItem;

const FINAL_PRIORITY_CONFIRMATION_ITEM = {
  key: "final_priority_confirmation",
  label: "마지막 우선순위 확인",
  promptHint:
    "지금까지의 우선순위와 제약을 짧게 정리한 뒤 빠진 것이 있는지 물었고 사용자가 그 확인에 답했는지",
  priority: 11,
  kind: "final_confirmation",
} satisfies OnboardingQuestionChecklistItem;

const PERMANENT_RESIDENCY_ONBOARDING_ITEM = {
  key: "permanent_residency",
  insightKey: "permanent_residency",
  label: "영주권 여부",
  promptHint:
    "For Singapore/Australia onboarding only: ask whether the user has permanent residency in their current country. Keep it factual and do not expand into broad visa advice unless the user volunteers related context.",
  priority: 6,
  kind: "question",
} satisfies OnboardingQuestionChecklistItem;

const CURRENT_OR_RECENT_WORK_DETAIL_ITEM = {
  key: "current_or_recent_work_detail",
  label: "현재/직전 업무 상세",
  promptHint:
    "For Singapore/Japan/Australia onboarding only: if the visible profile, resume, or recent conversation does not clearly explain what the user currently does or most recently did, ask them to describe their current or immediately previous work in a bit more detail. If that work is already clear enough, do not force this question.",
  priority: 7,
  kind: "question",
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
    ADDITIONAL_QUESTION_TWO_ITEM,
    FINAL_PRIORITY_CONFIRMATION_ITEM,
  ];

const COUNTRY_SCOPED_ONBOARDING_REMOVED_KEYS = new Set([
  "deal_breakers",
  "team_style_fit",
]);

const COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY: Record<
  CountryScopedOnboardingCountry,
  OnboardingQuestionChecklistItem[]
> = {
  SG: [
    ...INSIGHT_BACKED_ONBOARDING_ITEMS.filter(
      (item) => !COUNTRY_SCOPED_ONBOARDING_REMOVED_KEYS.has(item.key)
    ),
    PERMANENT_RESIDENCY_ONBOARDING_ITEM,
    CURRENT_OR_RECENT_WORK_DETAIL_ITEM,
    ADDITIONAL_QUESTION_ONE_ITEM,
    FINAL_PRIORITY_CONFIRMATION_ITEM,
  ],
  JP: [
    ...INSIGHT_BACKED_ONBOARDING_ITEMS.filter(
      (item) => !COUNTRY_SCOPED_ONBOARDING_REMOVED_KEYS.has(item.key)
    ),
    CURRENT_OR_RECENT_WORK_DETAIL_ITEM,
    ADDITIONAL_QUESTION_ONE_ITEM,
    FINAL_PRIORITY_CONFIRMATION_ITEM,
  ],
  AU: [
    ...INSIGHT_BACKED_ONBOARDING_ITEMS.filter(
      (item) => !COUNTRY_SCOPED_ONBOARDING_REMOVED_KEYS.has(item.key)
    ),
    PERMANENT_RESIDENCY_ONBOARDING_ITEM,
    CURRENT_OR_RECENT_WORK_DETAIL_ITEM,
    ADDITIONAL_QUESTION_ONE_ITEM,
    FINAL_PRIORITY_CONFIRMATION_ITEM,
  ],
};

export const ONBOARDING_QUESTION_MIN_COVERED_COUNT = 8;

const ALL_ONBOARDING_QUESTION_CHECKLIST: OnboardingQuestionChecklistItem[] = [
  ...ONBOARDING_QUESTION_CHECKLIST,
  ...COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY.SG,
  ...COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY.JP,
  ...COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY.AU,
];

export function getOnboardingQuestionChecklist(
  context?: OnboardingChecklistLocationContext
): OnboardingQuestionChecklistItem[] {
  const country = getCountryScopedOnboardingCountry(context);
  if (country) {
    return COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY[country];
  }

  return ONBOARDING_QUESTION_CHECKLIST;
}

export function getOnboardingAdditionalQuestionKeys(
  context?: OnboardingChecklistLocationContext
) {
  return getOnboardingQuestionChecklist(context)
    .filter((item) => item.kind === "additional_question")
    .map((item) => item.key);
}

export function getOnboardingAdditionalQuestionMin(
  context?: OnboardingChecklistLocationContext
) {
  return getOnboardingAdditionalQuestionKeys(context).length;
}

export function getOnboardingRequiredQuestionKeys(
  context?: OnboardingChecklistLocationContext
) {
  const country = getCountryScopedOnboardingCountry(context);
  if (country === "SG" || country === "AU") {
    return [PERMANENT_RESIDENCY_ONBOARDING_ITEM.key];
  }

  return [];
}

export function getOnboardingQuestionByInsightKey(
  context?: OnboardingChecklistLocationContext
) {
  return new Map(
    getOnboardingQuestionChecklist(context)
      .filter((item) => item.insightKey)
      .map((item) => [item.insightKey as string, item.key])
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
  ALL_ONBOARDING_QUESTION_CHECKLIST.filter((item) => item.insightKey).map(
    (item) => [item.insightKey as string, item.key]
  )
);

export function getInsightChecklist(
  context?: OnboardingChecklistLocationContext
): InsightChecklistItem[] {
  const country = getCountryScopedOnboardingCountry(context);
  const items = country
    ? COUNTRY_SCOPED_ONBOARDING_QUESTION_CHECKLIST_BY_COUNTRY[country].filter(
        (item) => item.insightKey
      )
    : INSIGHT_BACKED_ONBOARDING_ITEMS;
  return items.map((item) => ({
    key: item.insightKey ?? item.key,
    label: item.label,
    promptHint: item.promptHint,
    priority: item.priority,
  }));
}

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
  [
    ...INSIGHT_CHECKLIST.map((item) => [item.key, item.label] as const),
    [
      PERMANENT_RESIDENCY_ONBOARDING_ITEM.insightKey,
      PERMANENT_RESIDENCY_ONBOARDING_ITEM.label,
    ] as const,
  ]
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
