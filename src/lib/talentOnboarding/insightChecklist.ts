export type InsightChecklistItem = {
  /** Normalized key for talent_insights.content, e.g. "career_move_motivation" */
  key: string;
  /** Korean display label for UI */
  label: string;
  /** One-line description for LLM extraction guidance */
  promptHint: string;
  /** Lower = ask earlier in conversation (1-10) */
  priority: number;
};

export const INSIGHT_CHECKLIST: InsightChecklistItem[] = [
  {
    key: "career_move_motivation",
    label: "이직 동기",
    promptHint:
      "Why they want to change jobs, what triggered the search",
    priority: 1,
  },
  {
    key: "ideal_company_culture",
    label: "선호 회사 문화",
    promptHint:
      "Preferred company culture, work style, team dynamics (horizontal vs vertical, fast-paced vs stable)",
    priority: 2,
  },
  {
    key: "career_direction",
    label: "커리어 방향",
    promptHint:
      "Where they want their career to go in 2-3 years, desired role evolution",
    priority: 3,
  },
  {
    key: "work_values",
    label: "업무 가치관",
    promptHint:
      "What they value most in work: impact, compensation, growth, autonomy, work-life balance, etc.",
    priority: 4,
  },
  {
    key: "compensation_expectations",
    label: "보상 기대",
    promptHint:
      "Salary expectations, equity preferences, benefits priorities",
    priority: 5,
  },
  {
    key: "work_style_preference",
    label: "근무 형태 선호",
    promptHint:
      "Remote/hybrid/onsite preference, commute tolerance, work-life balance expectations",
    priority: 6,
  },
  {
    key: "company_avoidance",
    label: "기피 회사/분야",
    promptHint:
      "Companies, industries, or environments they want to avoid and why",
    priority: 7,
  },
  {
    key: "current_satisfaction",
    label: "현재 직장 만족도",
    promptHint:
      "What they like and dislike about current role/company, pain points",
    priority: 8,
  },
  {
    key: "ai_tool_usage",
    label: "AI 도구 활용",
    promptHint:
      "How they use AI tools in their work, level of adoption and attitude",
    priority: 9,
  },
  {
    key: "global_mobility",
    label: "해외 근무 의사",
    promptHint:
      "Willingness to work abroad or at international companies, language proficiency",
    priority: 10,
  },
  {
    key: "preferred_engagement_type",
    label: "선호 근무 형태",
    promptHint:
      "Preferred engagement: full-time, fractional/part-time, or technical advisor role",
    priority: 2,
  },
  {
    key: "preferred_work_location",
    label: "선호 근무 지역",
    promptHint:
      "Preferred work location: Korea-based, US/global remote, or willing to relocate",
    priority: 3,
  },
  {
    key: "career_move_intent",
    label: "이직 의향",
    promptHint:
      "Job move intent: actively looking, open to exploring, or only interested in part-time/advisor",
    priority: 1,
  },
  // --- Step 4 (Logistics & Relocation) items ---
  {
    key: "relocation_intent",
    label: "리로케이션 의향",
    promptHint:
      "Willingness to relocate (e.g. US→Korea or vice versa), timeline, and seriousness level",
    priority: 11,
  },
  {
    key: "visa_status",
    label: "비자 상황",
    promptHint:
      "Current visa/residency status and any immigration hurdles for relocation (family, sponsorship needs)",
    priority: 12,
  },
  {
    key: "salary_package",
    label: "연봉 패키지",
    promptHint:
      "Current compensation package and target salary expectations for the next role",
    priority: 13,
  },
  {
    key: "equity_openness",
    label: "스톡옵션/지분 수용도",
    promptHint:
      "Openness to stock options or equity as part of compensation, especially if cash comp is lower",
    priority: 14,
  },
  {
    key: "competing_offers",
    label: "경쟁 오퍼",
    promptHint:
      "Whether they are interviewing elsewhere or have existing offers (for timeline coordination)",
    priority: 15,
  },
  {
    key: "join_timeline",
    label: "합류 타이밍",
    promptHint:
      "How soon they can join after accepting an offer (notice period, relocation logistics)",
    priority: 16,
  },
  // --- Step 3 (Expectation vs Reality) items ---
  {
    key: "business_impact_experience",
    label: "비즈니스 임팩트 경험",
    promptHint:
      "Experience contributing to business metrics beyond technical work (revenue, user growth, cost reduction)",
    priority: 17,
  },
  {
    key: "first_quarter_goal",
    label: "첫 3개월 목표",
    promptHint:
      "What impact they want to demonstrate in the first 3 months at a new company",
    priority: 18,
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

/** Map of checklist key → Korean label for UI display */
export const INSIGHT_CHECKLIST_LABEL_MAP = new Map(
  INSIGHT_CHECKLIST.map((item) => [item.key, item.label])
);

/** Map of checklist key → priority index for UI ordering */
export const INSIGHT_CHECKLIST_ORDER_MAP = new Map(
  INSIGHT_CHECKLIST.map((item, index) => [item.key, index])
);

/** Get Korean label for an insight key, falling back to formatted key */
export function getInsightLabel(key: string): string {
  return INSIGHT_CHECKLIST_LABEL_MAP.get(key) ?? formatInsightKeyLabel(key);
}

/** Format a snake_case key as a readable label (fallback for non-checklist keys) */
function formatInsightKeyLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
