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
export const INSIGHT_CHECKLIST: InsightChecklistItem[] = [
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
