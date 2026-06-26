import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsDebugOpportunityRuns,
  parseOpsDebugOpportunityRunLimit,
  parseOpsDebugOpportunityRunOffset,
  parseOpsDebugOpportunityRunOutcome,
  parseOpsDebugOpportunityRunStatus,
} from "@/lib/ops/debugOpportunityRunServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const payload = await fetchOpsDebugOpportunityRuns({
      createdFrom: req.nextUrl.searchParams.get("createdFrom"),
      createdTo: req.nextUrl.searchParams.get("createdTo"),
      limit: parseOpsDebugOpportunityRunLimit(
        req.nextUrl.searchParams.get("limit")
      ),
      offset: parseOpsDebugOpportunityRunOffset(
        req.nextUrl.searchParams.get("offset")
      ),
      outcome: parseOpsDebugOpportunityRunOutcome(
        req.nextUrl.searchParams.get("outcome")
      ),
      query: req.nextUrl.searchParams.get("query"),
      status: parseOpsDebugOpportunityRunStatus(
        req.nextUrl.searchParams.get("status")
      ),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load opportunity discovery runs"
    );
  }
}
