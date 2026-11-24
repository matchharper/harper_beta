import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { opsMetricExclusionKey } from "@/lib/ops/metricSnapshots";
import { readOpsMetricSnapshotForRoute } from "@/lib/ops/metricSnapshots.server";
import {
  opsTalentMetricsSnapshotRange,
  type OpsTalentMetricInterval,
  type OpsTalentMetricsSection,
} from "@/lib/ops/talentMetrics";
import {
  fetchOpsTalentMetricsSection,
  parseOpsTalentMetricsRange,
} from "@/lib/ops/talentMetricsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sections render independently, so a slower cohort scan does not block the
// rest of the dashboard. A stale snapshot is recomputed after the response
// within this limit too.
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
    const interval = readInterval(req.nextUrl.searchParams.get("interval"));
    const excludedEmails = req.nextUrl.searchParams.getAll("excludedEmail");
    const range = opsTalentMetricsSnapshotRange(parseOpsTalentMetricsRange(from, to));
    return NextResponse.json(
      await readOpsMetricSnapshotForRoute({
        // Runs to the end even if the viewer leaves, so the next view has it.
        compute: () =>
          fetchOpsTalentMetricsSection({
            excludedEmails,
            interval,
            section,
            ...range.resolve(Date.now()),
          }),
        force: req.nextUrl.searchParams.get("refresh") === "1",
        key: `talent-metrics:${section}:${range.key}:${interval}:${opsMetricExclusionKey(excludedEmails)}`,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load talent metrics");
  }
}
