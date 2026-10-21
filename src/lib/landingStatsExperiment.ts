export const LANDING_STATS_EXPERIMENT = "career_landing_stats_v1";
export const LANDING_STATS_COOKIE = "harper_career_landing_stats_v1";
export const LANDING_STATS_EXPOSURE = "landing_stats_exposure";
export const LANDING_STATS_ABTEST_A = `${LANDING_STATS_EXPERIMENT}_a`;
export const LANDING_STATS_ABTEST_B = `${LANDING_STATS_EXPERIMENT}_b`;
export const LANDING_STATS_CONVERSION_WINDOW_MS = 24 * 60 * 60 * 1000;

export type LandingStatsVariant = "A" | "B";

export function parseLandingStatsVariant(
  value: unknown
): LandingStatsVariant | null {
  return value === "A" || value === "B" ? value : null;
}

export function getLandingStatsAbtestType(variant: LandingStatsVariant) {
  return variant === "A" ? LANDING_STATS_ABTEST_A : LANDING_STATS_ABTEST_B;
}
