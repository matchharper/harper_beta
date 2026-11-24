import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { opsMetricExclusionKey } from "@/lib/ops/metricSnapshots";
import { readOpsMetricSnapshotForRoute } from "@/lib/ops/metricSnapshots.server";
import { opsTalentMetricsSnapshotRange } from "@/lib/ops/talentMetrics";
import { parseOpsTalentMetricsRange } from "@/lib/ops/talentMetricsServer";
import { fetchOpsUpdateMetrics } from "@/lib/ops/updateMetrics.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 배포 후 실험중인 지표: daily values over the chosen range (the screen adds them into weeks). */
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
    const excludedEmails = req.nextUrl.searchParams.getAll("excludedEmail");
    // A quick range is kept as "the last N days", so a later day starts from the saved result.
    const range = opsTalentMetricsSnapshotRange(parseOpsTalentMetricsRange(from, to));
    return NextResponse.json(
      await readOpsMetricSnapshotForRoute({
        compute: () =>
          fetchOpsUpdateMetrics({ excludedEmails, ...range.resolve(Date.now()) }),
        force: req.nextUrl.searchParams.get("refresh") === "1",
        // v2: daily values per metric. Results saved by the weekly before/after version use other keys.
        key: `update-metrics:v2:${range.key}:${opsMetricExclusionKey(excludedEmails)}`,
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load update metrics");
  }
}
