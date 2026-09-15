import type { BlogLocale } from "@/lib/blog";
import {
  isBlogEventName,
  isInternalBlogAnalyticsId,
  makeBlogConversionEventType,
  makeBlogViewEventType,
  type BlogEventName,
  type BlogEventSurface,
} from "@/lib/blogMetrics";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EVENT_SURFACES = new Set<BlogEventSurface>([
  "featured",
  "list",
  "rail",
  "related",
]);

type BlogEventBody = {
  anonymousId?: unknown;
  eventType?: unknown;
  locale?: unknown;
  postSlug?: unknown;
  surface?: unknown;
  targetSlug?: unknown;
};

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeSlug(value: unknown) {
  const slug = normalizeOptionalText(value, 180);
  if (!slug) return null;
  if (!SLUG_PATTERN.test(slug)) throw new Error("Invalid slug");
  return slug;
}

function normalizeLocale(value: unknown): BlogLocale {
  return value === "en" ? "en" : "ko";
}

function normalizeSurface(value: unknown): BlogEventSurface | null {
  return EVENT_SURFACES.has(value as BlogEventSurface)
    ? (value as BlogEventSurface)
    : null;
}

function requireSlug(value: string | null, field: string) {
  if (!value) throw new Error(`${field} is required`);
  return value;
}

function buildLandingLogType(args: {
  eventType: BlogEventName;
  postSlug: string | null;
  surface: BlogEventSurface | null;
  targetSlug: string | null;
}) {
  switch (args.eventType) {
    case "list_view":
      return "blog_list_view";
    case "post_view":
      return makeBlogViewEventType(requireSlug(args.postSlug, "postSlug"));
    case "post_open":
      return [
        "blog_post_open",
        args.surface ?? "list",
        requireSlug(args.targetSlug, "targetSlug"),
      ].join(":");
    case "talk_click":
      return makeBlogConversionEventType(
        requireSlug(args.postSlug, "postSlug")
      );
    case "copy_link":
      return `blog_copy_link:${requireSlug(args.postSlug, "postSlug")}`;
    case "job_open":
      return [
        "blog_job_open",
        requireSlug(args.postSlug, "postSlug"),
        requireSlug(args.targetSlug, "targetSlug"),
      ].join(":");
    case "all_jobs_open":
      return `blog_all_jobs_open:${requireSlug(args.postSlug, "postSlug")}`;
  }
}

function isMobileUserAgent(value: string | null) {
  if (!value) return null;
  return /android|iphone|ipad|ipod|mobile/i.test(value);
}

export async function POST(req: NextRequest) {
  let body: BlogEventBody;
  try {
    body = (await req.json()) as BlogEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isBlogEventName(body.eventType)) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  try {
    const eventType = body.eventType;
    const postSlug = normalizeSlug(body.postSlug);
    const targetSlug = normalizeSlug(body.targetSlug);
    const locale = normalizeLocale(body.locale);
    const type = buildLandingLogType({
      eventType,
      postSlug,
      surface: normalizeSurface(body.surface),
      targetSlug,
    });
    const userAgent = normalizeOptionalText(req.headers.get("user-agent"), 500);
    const anonymousId = normalizeOptionalText(body.anonymousId, 120);
    if (isInternalBlogAnalyticsId(anonymousId)) {
      return NextResponse.json({ ok: true });
    }
    const { error } = await getTalentSupabaseAdmin()
      .from("landing_logs")
      .insert({
        country_lang: locale,
        is_mobile: isMobileUserAgent(userAgent),
        local_id: anonymousId,
        type,
      });

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save blog event";
    const isInvalidInput =
      message === "Invalid slug" || message.endsWith(" is required");
    return NextResponse.json(
      { error: message },
      { status: isInvalidInput ? 400 : 500 }
    );
  }
}
