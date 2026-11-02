import { NextResponse } from "next/server";
import { COMPANY_LANDING_STATS_CACHE_SECONDS } from "@/lib/companyLandingStats";
import { readCompanyLandingStats } from "@/lib/companyLandingStats.server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await readCompanyLandingStats();
    return NextResponse.json(stats, {
      headers: {
        "Cache-Control":
          `public, max-age=0, s-maxage=${COMPANY_LANDING_STATS_CACHE_SECONDS}`,
      },
    });
  } catch {
    console.error("[company-landing-stats] Could not load statistics");
    return NextResponse.json(
      { error: "Statistics are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
