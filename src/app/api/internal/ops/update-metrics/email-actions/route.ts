import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsEmailActionMetrics } from "@/lib/ops/emailActionMetrics.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RANGES = new Set([28, 56, 90]);

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const days = Number(req.nextUrl.searchParams.get("days") ?? 56);
    if (!RANGES.has(days)) {
      return NextResponse.json(
        { error: "기간은 28·56·90일 중 하나여야 합니다." },
        { status: 400 }
      );
    }
    const excludedEmails = req.nextUrl.searchParams.getAll("excludedEmail");
    return NextResponse.json(
      await fetchOpsEmailActionMetrics({ days, excludedEmails })
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load email action metrics");
  }
}
