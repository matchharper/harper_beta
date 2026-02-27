export const BLOG_VIEW_EVENT_PREFIX = "blog_view:";
export const BLOG_CONVERSION_EVENT_PREFIX = "blog_conversion:";
export const LANDING_ID_STORAGE_KEY = "harper_landing_id_0209";

export function makeBlogViewEventType(slug: string): string {
  return `${BLOG_VIEW_EVENT_PREFIX}${slug}`;
}

export function makeBlogConversionEventType(slug: string): string {
  return `${BLOG_CONVERSION_EVENT_PREFIX}${slug}`;
}

function createClientTrackingId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateLandingId(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(LANDING_ID_STORAGE_KEY);
  if (existing) return existing;

  const nextId = createClientTrackingId();
  localStorage.setItem(LANDING_ID_STORAGE_KEY, nextId);
  return nextId;
}
