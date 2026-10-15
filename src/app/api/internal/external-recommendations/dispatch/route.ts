import { NextRequest, NextResponse } from "next/server";
import { dispatchDailyRuns } from "@/lib/externalRecommendationsV2/daily";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return new NextResponse(null, { status: 401 });
  return NextResponse.json(await dispatchDailyRuns());
}
