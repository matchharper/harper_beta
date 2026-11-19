import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type { OpsTalentMetricInterval } from "@/lib/ops/talentMetrics";
import { fetchOpsTalentMetricsOverview } from "@/lib/ops/talentMetricsOverview.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function readInterval(value: string | null): OpsTalentMetricInterval {
  if (value === "day" || value === "month") return value;
  return "week";
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    if (!from || !to) {
      return NextResponse.json(
        { error: "조회 시작일과 종료일이 필요합니다." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await fetchOpsTalentMetricsOverview({
        excludedEmails: req.nextUrl.searchParams.getAll("excludedEmail"),
        from,
        interval: readInterval(req.nextUrl.searchParams.get("interval")),
        to,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load talent overview metrics");
  }
}
