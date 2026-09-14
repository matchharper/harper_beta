export const CAREER_LIVE_SYNC_EVENT = "career_changed";
export const CAREER_LIVE_SYNC_DEBOUNCE_MS = 300;

export type CareerLiveSyncScope =
  | "all"
  | "messages"
  | "opportunities"
  | "runs";

const CAREER_LIVE_SYNC_SCOPES = new Set<CareerLiveSyncScope>([
  "messages",
  "opportunities",
  "runs",
]);

export const buildCareerLiveSyncTopic = (userId: string) =>
  `talent-career:${userId}`;

export const readCareerLiveSyncScope = (
  value: unknown
): CareerLiveSyncScope => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "all";
  const payload = (value as { payload?: unknown }).payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "all";
  }
  const scope = (payload as { scope?: unknown }).scope;
  return typeof scope === "string" &&
    CAREER_LIVE_SYNC_SCOPES.has(scope as CareerLiveSyncScope)
    ? (scope as CareerLiveSyncScope)
    : "all";
};
