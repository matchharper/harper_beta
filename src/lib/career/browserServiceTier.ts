export const CAREER_BROWSER_SERVICE_TIER_HEADER = "x-career-browser-service-tier";
export const DEFAULT_CAREER_BROWSER_SERVICE_TIER = "priority";
export type CareerBrowserServiceTier = "priority" | "default";

export function resolveCareerBrowserServiceTier(value: unknown): CareerBrowserServiceTier {
  return value === "default" ? "default" : DEFAULT_CAREER_BROWSER_SERVICE_TIER;
}
