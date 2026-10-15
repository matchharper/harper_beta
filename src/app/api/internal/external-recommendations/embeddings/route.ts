import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { backfillRoleTitles } from "@/lib/externalRecommendationsV2/embeddings";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new NextResponse(null, { status: 401 });
  return NextResponse.json(await backfillRoleTitles(getTalentSupabaseAdmin()));
}
