import type { BlogLocale } from "@/lib/blog";
import { trackGaEvent } from "@/lib/ga";

export const BLOG_VIEW_EVENT_PREFIX = "blog_view:";
export const BLOG_CONVERSION_EVENT_PREFIX = "blog_conversion:";
export const LANDING_ID_STORAGE_KEY = "harper_landing_id_0209";
const INTERNAL_ANALYTICS_ID = "a4d4df1a-aa6d-401e-a34a-00d426630fe2";

export type BlogEventName =
  | "all_jobs_open"
  | "copy_link"
  | "job_open"
  | "list_view"
  | "post_open"
  | "post_view"
  | "talk_click";

export type BlogEventSurface = "featured" | "list" | "rail" | "related";

type PostBlogEventInput = {
  eventType: BlogEventName;
  locale: BlogLocale;
  postSlug?: string;
  surface?: BlogEventSurface;
  targetSlug?: string;
};

const BLOG_EVENT_NAMES = new Set<BlogEventName>([
  "all_jobs_open",
  "copy_link",
  "job_open",
  "list_view",
  "post_open",
  "post_view",
  "talk_click",
]);

let fallbackTrackingId = "";

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

  try {
    const existing = window.localStorage.getItem(LANDING_ID_STORAGE_KEY);
    if (existing) return existing;

    const nextId = createClientTrackingId();
    window.localStorage.setItem(LANDING_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    if (!fallbackTrackingId) fallbackTrackingId = createClientTrackingId();
    return fallbackTrackingId;
  }
}

export function isBlogEventName(value: unknown): value is BlogEventName {
  return (
    typeof value === "string" && BLOG_EVENT_NAMES.has(value as BlogEventName)
  );
}

export function isInternalBlogAnalyticsId(value: string | null) {
  return value === INTERNAL_ANALYTICS_ID;
}

export async function postBlogEvent({
  eventType,
  locale,
  postSlug,
  surface,
  targetSlug,
}: PostBlogEventInput) {
  if (typeof window === "undefined") return false;

  try {
    const anonymousId = getOrCreateLandingId();
    if (isInternalBlogAnalyticsId(anonymousId)) return false;

    trackGaEvent(`blog_${eventType}`, {
      blog_locale: locale,
      blog_post_slug: postSlug,
      blog_surface: surface,
      blog_target_slug: targetSlug,
    });

    const response = await fetch("/api/blog/events", {
      body: JSON.stringify({
        anonymousId,
        eventType,
        locale,
        postSlug: postSlug ?? null,
        surface: surface ?? null,
        targetSlug: targetSlug ?? null,
      }),
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    });

    if (!response.ok) {
      console.warn("blog event failed:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("blog event failed:", error);
    return false;
  }
}
