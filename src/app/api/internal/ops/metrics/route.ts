import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import type {
  OpsTalentMetricInterval,
  OpsTalentMetricsSection,
} from "@/lib/ops/talentMetrics";
import { fetchOpsTalentMetricsSection } from "@/lib/ops/talentMetricsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sections render independently, so a slower cohort scan does not block the
// rest of the dashboard. Keep enough headroom for the longest retained range.
export const maxDuration = 300;

function readInterval(value: string | null): OpsTalentMetricInterval {
  if (value === "day" || value === "month") return value;
  return "week";
}

function readSection(value: string | null): OpsTalentMetricsSection | null {
  if (
    value === "conversion" ||
    value === "engagement" ||
    value === "retention"
  ) {
    return value;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const from = req.nextUrl.searchParams.get("from") ?? "";
    const to = req.nextUrl.searchParams.get("to") ?? "";
    const section = readSection(req.nextUrl.searchParams.get("section"));
    if (!from || !to || !section) {
      return NextResponse.json(
        { error: "조회 시작일, 종료일, 지표 영역이 필요합니다." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await fetchOpsTalentMetricsSection({
        excludedEmails: req.nextUrl.searchParams.getAll("excludedEmail"),
        from,
        interval: readInterval(req.nextUrl.searchParams.get("interval")),
        section,
        signal: req.signal,
        to,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load talent metrics");
  }
}
