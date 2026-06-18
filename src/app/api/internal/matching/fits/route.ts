import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingFits,
  parseOpsMatchingFitLabels,
  parseOpsMatchingLimit,
  parseOpsMatchingOffset,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsMatchingFits({
      humanLabels: parseOpsMatchingFitLabels(
        req.nextUrl.searchParams.get("humanLabels")
      ),
      limit: parseOpsMatchingLimit(req.nextUrl.searchParams.get("limit")),
      llmLabels: parseOpsMatchingFitLabels(
        req.nextUrl.searchParams.get("llmLabels")
      ),
      offset: parseOpsMatchingOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load internal fit records"
    );
  }
}
