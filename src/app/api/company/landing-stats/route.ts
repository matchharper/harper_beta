import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  COMPANY_LANDING_STATS_REFRESH_SECONDS,
  COMPANY_LANDING_MATCH_REFRESH_SECONDS,
  combineCompanyLandingStats,
  type CompanyLandingSnapshot,
  type CompanyLandingPairSnapshot,
} from "@/lib/companyLandingStats";
import {
  readCompanyLandingStats,
  readCompanyLandingPairStats,
} from "@/lib/companyLandingStats.server";

export const runtime = "nodejs";
export const maxDuration = 60;

let pendingRead: Promise<CompanyLandingSnapshot> | null = null;
function readStatsOnce() {
  // Concurrent cold requests on one instance share the expensive aggregation.
  pendingRead ??= readCompanyLandingStats().finally(() => {
    pendingRead = null;
  });
  return pendingRead;
}

// Shared across visitors and languages, persisted by Next's Data Cache.
// Refresh on the first request after 24 hours; failed refreshes keep old data.
const getStats = unstable_cache(readStatsOnce, ["company-landing-stats-v4"], {
  revalidate: COMPANY_LANDING_STATS_REFRESH_SECONDS,
});

let pendingPairRead: Promise<CompanyLandingPairSnapshot> | null = null;
function readPairsOnce() {
  pendingPairRead ??= readCompanyLandingPairStats().finally(() => {
    pendingPairRead = null;
  });
  return pendingPairRead;
}

const getPairStats = unstable_cache(
  readPairsOnce,
  ["company-landing-pair-stats-v2"],
  { revalidate: COMPANY_LANDING_MATCH_REFRESH_SECONDS }
);

export async function GET() {
  try {
    const [daily, latest] = await Promise.all([getStats(), getPairStats()]);
    return NextResponse.json(combineCompanyLandingStats(daily, latest), {
      headers: {
        "Cache-Control":
          "public, max-age=30, s-maxage=30, stale-while-revalidate=30",
      },
    });
  } catch {
    console.error("[company-landing-stats] Could not refresh statistics");
    return NextResponse.json(
      { error: "Statistics are temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
