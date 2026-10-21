export type CompanyLandingSnapshot = {
  talentCount: number;
  averageConversationMessages: number | null;
  assessedPairCount: number;
  updatedAt: string;
};

export type CompanyLandingPairSnapshot = Pick<
  CompanyLandingSnapshot,
  "assessedPairCount" | "updatedAt"
> & {
  recentAssessmentsPerSecond?: number;
};

export type CompanyLandingStats = CompanyLandingSnapshot & {
  assessedPairUpdatedAt: string;
  assessedPairsPerSecond: number;
};

export const COMPANY_LANDING_STATS_REFRESH_SECONDS = 24 * 60 * 60;
export const COMPANY_LANDING_MATCH_REFRESH_SECONDS = 5 * 60;
export const COMPANY_LANDING_STATS_POLL_SECONDS = 60;
export const COMPANY_LANDING_MATCH_PROJECTION_SECONDS = 10 * 60;
export const COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS = 7 * 24 * 60 * 60;

export function combineCompanyLandingStats(
  daily: CompanyLandingSnapshot,
  latest: CompanyLandingPairSnapshot
): CompanyLandingStats {
  // A just-refreshed daily baseline can be newer than the five-minute cache.
  const snapshot =
    Date.parse(latest.updatedAt) >= Date.parse(daily.updatedAt) ? latest : daily;
  const elapsed =
    (Date.parse(snapshot.updatedAt) - Date.parse(daily.updatedAt)) / 1000;
  return {
    ...daily,
    assessedPairCount: snapshot.assessedPairCount,
    assessedPairUpdatedAt: snapshot.updatedAt,
    // Until two separated snapshots exist, use recent assessment activity.
    // This is a pacing estimate (timestamps also change on reevaluation),
    // not a claim that every recent assessment created a new unique pair.
    assessedPairsPerSecond:
      elapsed >= 60
        ? Math.max(0, snapshot.assessedPairCount - daily.assessedPairCount) / elapsed
        : Math.max(0, latest.recentAssessmentsPerSecond ?? 0),
  };
}

export function projectCompanyLandingPairCount(
  stats: CompanyLandingStats,
  now: number
): number {
  const age =
    (now - Date.parse(stats.assessedPairUpdatedAt ?? stats.updatedAt)) / 1000;
  const elapsed = Math.min(
    COMPANY_LANDING_MATCH_PROJECTION_SECONDS,
    Math.max(0, Number.isFinite(age) ? age : 0)
  );
  const rate = Number.isFinite(stats.assessedPairsPerSecond)
    ? Math.max(0, stats.assessedPairsPerSecond)
    : 0;
  return stats.assessedPairCount + rate * elapsed;
}
