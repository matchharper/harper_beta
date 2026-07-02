export const CAREER_CHAT_ALLOWED_TOOLS_BY_ACTION = {
  currentDataJobPostingRecommendation: ["recommend_job_postings"],
  moreOpenPositions: ["recommend_job_postings"],
} as const satisfies Record<string, readonly string[]>;
