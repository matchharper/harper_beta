export type CompanyLandingStats = {
  talentCount: number;
  averageConversationMessages: number | null;
  assessedPairCount: number;
  updatedAt: string;
};

export const COMPANY_LANDING_STATS_CACHE_SECONDS = 60;
