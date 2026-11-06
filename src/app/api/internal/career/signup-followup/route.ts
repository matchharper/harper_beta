import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
export const runtime = "nodejs";
export const maxDuration = 240;
export const dynamic = "force-dynamic";

function getConfiguredAuthSecrets() {
  return [
    process.env.SIGN_UP_FOLLOWUP_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_WORKER_API_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7).trim();
  if (!provided) return false;

  return getConfiguredAuthSecrets().some((secret) => {
    const expectedBuffer = Buffer.from(secret);
    const actualBuffer = Buffer.from(provided);
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  });
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await (getTalentSupabaseAdmin().rpc as any)("seed_incomplete_career_schedules", {
    p_dry_run: req.nextUrl.searchParams.get("dryRun") !== "false",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
export const GET = handle;
export const POST = handle;
