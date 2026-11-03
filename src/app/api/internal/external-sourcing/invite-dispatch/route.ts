import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchExternalInvites } from "@/lib/org/agent/externalInvite.server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

function authorized(req: NextRequest) {
  const provided = Buffer.from((req.headers.get("authorization") ?? "").replace(/^bearer\s+/i, "").trim());
  return [process.env.CRON_SECRET?.trim(), process.env.INTERNAL_WORKER_API_SECRET?.trim()]
    .filter((secret): secret is string => Boolean(secret))
    .map((secret) => Buffer.from(secret))
    .some((secret) => provided.length === secret.length && timingSafeEqual(secret, provided));
}

/** Cron (5 min): invitation emails for recorded external connection requests. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await dispatchExternalInvites({ admin: getSupabaseAdmin() })) });
  } catch (error) {
    console.error("[external-invite] dispatch failed", error);
    return NextResponse.json({ error: "External invitation dispatch failed" }, { status: 500 });
  }
}
