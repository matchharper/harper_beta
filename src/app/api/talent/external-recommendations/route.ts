import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { resolveCareerRequestTimeZone } from "@/lib/career/requestTimeZone";
import {
  dailySnapshot,
  startDailyRun,
} from "@/lib/externalRecommendationsV2/daily";
export const runtime = "nodejs";
export const maxDuration = 30;
async function handle(req: NextRequest, start: boolean) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getTalentSupabaseAdmin();
  const timeZone = resolveCareerRequestTimeZone(
    req,
    req.nextUrl.searchParams.get("timeZone")
  );
  const locale = req.nextUrl.searchParams.get("locale") === "en" ? "en" : "ko";
  try {
    if (start) await startDailyRun(admin, user.id, timeZone, locale);
    return NextResponse.json(
      await dailySnapshot(admin, user.id, timeZone, locale),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "Could not load recommendations" },
      { status: 500 }
    );
  }
}
export const GET = (req: NextRequest) => handle(req, false);
export const POST = (req: NextRequest) => handle(req, true);
