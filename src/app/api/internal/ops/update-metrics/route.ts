import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsUpdateMetrics } from "@/lib/ops/updateMetrics.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const deployedOn = req.nextUrl.searchParams.get("deployedOn") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deployedOn)) {
      return NextResponse.json(
        { error: "배포일(YYYY-MM-DD)이 필요합니다." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await fetchOpsUpdateMetrics({
        deployedOn,
        excludedEmails: req.nextUrl.searchParams.getAll("excludedEmail"),
      })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load update metrics");
  }
}
