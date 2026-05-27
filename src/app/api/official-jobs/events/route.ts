import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import type { OfficialJobEventType } from "@/lib/officialJobEvents";
import type { Json } from "@/types/database.types";

const OFFICIAL_JOB_EVENT_TYPES = new Set<OfficialJobEventType>([
  "jobs_list_view",
  "jobs_cta_click",
  "jobs_identity_linked",
  "job_detail_view",
  "job_list_click",
  "job_apply_click",
  "job_company_click",
]);

type OfficialJobEventBody = {
  anonymousId?: string | null;
  eventType?: string | null;
  jobSlug?: string | null;
  metadata?: unknown;
  path?: string | null;
  referrer?: string | null;
};

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, maxLength);
}

function normalizeJobSlug(value: unknown) {
  const slug = normalizeOptionalString(value, 180);
  if (!slug) return null;

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Invalid jobSlug");
  }

  return slug;
}

function normalizeMetadata(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const entries = Object.entries(value).flatMap(([key, rawValue]) => {
    const normalizedKey = key.trim().slice(0, 80);
    if (!normalizedKey) return [];

    if (
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue === null
    ) {
      return [[normalizedKey, rawValue]];
    }

    return [];
  });

  return Object.fromEntries(entries) as Json;
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim().slice(0, 80) || null;
  }

  return req.headers.get("x-real-ip")?.trim().slice(0, 80) || null;
}

async function resolveOfficialJobId(jobSlug: string | null) {
  if (!jobSlug) return null;

  const { data, error } = await supabaseServer
    .from("official_jobs")
    .select("id")
    .eq("slug", jobSlug)
    .maybeSingle();

  if (error) {
    console.warn("official_job_events job lookup failed:", error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);

  let body: OfficialJobEventBody;
  try {
    body = (await req.json()) as OfficialJobEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = normalizeOptionalString(body.eventType, 80);
  if (
    !eventType ||
    !OFFICIAL_JOB_EVENT_TYPES.has(eventType as OfficialJobEventType)
  ) {
    return NextResponse.json({ error: "Invalid eventType" }, { status: 400 });
  }

  let jobSlug: string | null;
  try {
    jobSlug = normalizeJobSlug(body.jobSlug);
  } catch {
    return NextResponse.json({ error: "Invalid jobSlug" }, { status: 400 });
  }

  const officialJobId = await resolveOfficialJobId(jobSlug);
  const anonymousId = normalizeOptionalString(body.anonymousId, 120);

  if (user && anonymousId) {
    const { error: identifyError } = await supabaseServer
      .from("official_job_events")
      .update({
        user_id: user.id,
        user_email: user.email ?? null,
      })
      .eq("anonymous_id", anonymousId)
      .is("user_id", null);

    if (identifyError) {
      console.warn(
        "official_job_events identity backfill failed:",
        identifyError.message
      );
    }
  }

  const { error } = await supabaseServer.from("official_job_events").insert({
    anonymous_id: anonymousId,
    event_type: eventType,
    official_job_id: officialJobId,
    job_slug: jobSlug,
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    path: normalizeOptionalString(body.path, 500),
    referrer: normalizeOptionalString(body.referrer, 500),
    user_agent: normalizeOptionalString(req.headers.get("user-agent"), 500),
    ip_address: getClientIp(req),
    metadata: normalizeMetadata(body.metadata),
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to insert event" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
