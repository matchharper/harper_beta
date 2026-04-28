export type InsightChecklistItem = {
  /** Normalized key for talent_insights.content, e.g. "recent_achievement_hook" */
  key: string;
  /** Korean display label for UI */
  label: string;
  /** One-line description for LLM extraction guidance */
  promptHint: string;
  /** Lower = ask earlier in conversation (1-10) */
  priority: number;
};

/**
 * 10 data slots aligned with the Harper career system prompt.
 * Each slot maps to a conversation topic the AI should naturally explore.
 */
export const INSIGHT_CHECKLIST_OLD: InsightChecklistItem[] = [
  // Part 1: The Hook
  {
    key: "recent_achievement_hook",
    label: "최근 성과 훅",
    promptHint:
      "Most impactful project/performance from resume — what they drove and the breakthrough achieved",
    priority: 1,
  },
  {
    key: "unique_strength",
    label: "독보적 무기",
    promptHint:
      "The sharpest problem they can solve within the first month at a new team, based on their expertise",
    priority: 2,
  },
  {
    key: "managing_vs_ic",
    label: "매니징 vs 실무",
    promptHint:
      "Ideal ratio between team leading (managing) and hands-on IC work in their next role",
    priority: 3,
  },
  {
    key: "environment_preference",
    label: "불확실성/환경 내성",
    promptHint:
      "Preference between 0-to-1 chaotic startup environment vs stable scale-up with established systems",
    priority: 4,
  },
  // Part 3: Motivation
  {
    key: "current_pain_point",
    label: "현재 결핍",
    promptHint:
      "Career frustrations or structural dissatisfaction at current job (push factors)",
    priority: 5,
  },
  {
    key: "decisive_trigger",
    label: "결정적 트리거",
    promptHint:
      "The single 'cheat-key' condition that would make them join immediately if guaranteed",
    priority: 6,
  },
  {
    key: "domain_interest",
    label: "도메인 흥미",
    promptHint:
      "Specific domain they are most excited about (e.g. AI, B2B SaaS, fintech, biotech)",
    priority: 7,
  },
  // Part 4: Logistics & Alignment
  {
    key: "hard_constraints",
    label: "현실적 조건",
    promptHint:
      "Non-negotiable constraints: relocation, visa, 100% remote, location, family considerations",
    priority: 8,
  },
  {
    key: "compensation_philosophy",
    label: "보상 철학",
    promptHint:
      "Preference between stable high base salary vs aggressive equity/incentive, and absolute cash floor (bottom-line)",
    priority: 9,
  },
  {
    key: "target_references",
    label: "레퍼런스",
    promptHint:
      "Specific target companies or services they admire or believe would be a good fit",
    priority: 10,
  },
];

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
    key: "overseas_openness",
    label: "해외 이직/스타트업 개방성",
    promptHint:
      "Whether the user is open to overseas opportunities or overseas startup roles, and what conditions would make those options realistic or attractive",
    priority: 3,
  },
  {
    key: "next_scope",
    label: "다음 역할 범위",
    promptHint:
      "The scope the user wants in the next role, such as hands-on IC work, people leadership, 0-to-1 building, or scaling and operations",
    priority: 4,
  },
  {
    key: "ideal_opportunity",
    label: "원하는 기회 자유서술",
    promptHint:
      "A free-form description of the kind of opportunity the user wants, including role, team, domain, product, and working style",
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
  {
    key: "environment_preference",
    label: "선호하는 회사 단계/환경",
    promptHint:
      "The company stage or working environment the user prefers, such as early startup, growth-stage, large org, research-heavy, or product-driven",
    priority: 9,
  },
];

/** Get checklist items the talent has NOT yet answered, sorted by priority */
export function getUncoveredChecklistItems(
  currentInsights: Record<string, string> | null
): InsightChecklistItem[] {
  const covered = new Set(Object.keys(currentInsights ?? {}));
  return INSIGHT_CHECKLIST.filter((item) => !covered.has(item.key)).sort(
    (a, b) => a.priority - b.priority
  );
}

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
