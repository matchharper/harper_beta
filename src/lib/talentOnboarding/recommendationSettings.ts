export const DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS = 3;
export const DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE = 3;
export const DEFAULT_TALENT_GET_EXTERNAL_RECOMMENDATION = true;
export const DEFAULT_TALENT_GET_INTERNAL_RECOMMENDATION = true;

export const TALENT_PERIODIC_INTERVAL_DAYS_MIN = 1;
export const TALENT_PERIODIC_INTERVAL_DAYS_MAX = 7;
export const TALENT_RECOMMENDATION_BATCH_SIZE_MIN = 3;
export const TALENT_RECOMMENDATION_BATCH_SIZE_MAX = 10;

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  fallback: number
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function normalizeTalentPeriodicIntervalDays(value: unknown) {
  return clampInteger(
    value,
    TALENT_PERIODIC_INTERVAL_DAYS_MIN,
    TALENT_PERIODIC_INTERVAL_DAYS_MAX,
    DEFAULT_TALENT_PERIODIC_INTERVAL_DAYS
  );
}

export function normalizeTalentRecommendationBatchSize(value: unknown) {
  return clampInteger(
    value,
    TALENT_RECOMMENDATION_BATCH_SIZE_MIN,
    TALENT_RECOMMENDATION_BATCH_SIZE_MAX,
    DEFAULT_TALENT_RECOMMENDATION_BATCH_SIZE
  );
}

export function normalizeTalentRecommendationToggle(value: unknown) {
  return value !== false;
}
