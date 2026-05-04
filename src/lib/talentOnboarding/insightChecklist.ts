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

/**
 * 10 data slots aligned with the Harper career system prompt.
 * Each slot maps to a conversation topic the AI should naturally explore.
 */
export const INSIGHT_CHECKLIST: InsightChecklistItem[] = [
  {
    key: "search_intensity",
    label: "이직 적극도",
    promptHint:
      "How actively the user is exploring a move right now, from casually open to urgently trying to switch within a concrete timeline",
    priority: 1,
  },
  {
    key: "signature_story",
    label: "대표 경험 하나",
    promptHint:
      "The one career achievement, project, or experience the user most wants to talk about in detail",
    priority: 2,
  },
  {
    key: "location",
    label: "선호 근무 지역",
    promptHint:
      "The user's preferred work location or region, while gently also checking whether they are open to or considering overseas opportunities",
    priority: 3,
  },
  {
    key: "next_scope",
    label: "다음 역할",
    promptHint:
      "The Role the user wants in the next role, such as current-past role, people leadership(Team manager or C-level), other role if possible, opened to any role",
    priority: 4,
  },
  {
    key: "compensation",
    label: "기대 보상 조건",
    promptHint:
      "Whether the user has a minimum acceptable compensation level or 'this much would make sense' expectation for the next opportunity",
    priority: 5,
  },
  {
    key: "must_haves",
    label: "꼭 있어야 하는 조건",
    promptHint:
      "Non-negotiable must-have conditions for the next opportunity, such as team quality, resources, impact, compensation, visa, or remote setup",
    priority: 6,
  },
  {
    key: "deal_breakers",
    label: "피하고 싶은 조건",
    promptHint:
      "Clear deal-breakers or conditions that would make the user reject an opportunity even if other parts look attractive",
    priority: 7,
  },
  {
    key: "team_style_fit",
    label: "잘 맞는 팀/협업 방식",
    promptHint:
      "What kind of team, manager, and collaboration style helps the user do their best work, and what styles feel frustrating",
    priority: 8,
  },
  // {
  //   key: "environment_preference",
  //   label: "선호하는 회사 단계/환경",
  //   promptHint:
  //     "The company stage or working environment the user prefers, such as early startup, growth-stage, large org, research-heavy, or product-driven",
  //   priority: 9,
  // },
];

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
