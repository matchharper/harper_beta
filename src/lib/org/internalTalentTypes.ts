export type OrgInternalRecommendationStats = {
  accepted: number;
  noResponse: number;
  rejected: number;
  total: number;
};

export type OrgInternalTalentSystemResponse = {
  account: {
    createdAt: string | null;
    externalRecommendationsEnabled: boolean;
    internalRecommendationsEnabled: boolean;
    isOnboardingDone: boolean;
    lastActiveAt: string | null;
    lastLoginAt: string | null;
    profileVisibility: string | null;
    status: string | null;
    statusUpdatedAt: string | null;
  };
  recent7Days: {
    external: OrgInternalRecommendationStats;
    internal: OrgInternalRecommendationStats;
    since: string;
  };
  talentId: string;
};
