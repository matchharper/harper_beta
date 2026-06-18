import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingTalentPool,
  parseOpsMatchingDateOnly,
  parseOpsMatchingLimit,
  parseOpsMatchingOffset,
  parseOpsMatchingTags,
  parseOpsMatchingTalentPoolTab,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsMatchingTalentPool({
      createdFrom: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdFrom")
      ),
      createdTo: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdTo")
      ),
      limit: parseOpsMatchingLimit(req.nextUrl.searchParams.get("limit")),
      offset: parseOpsMatchingOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      tab: parseOpsMatchingTalentPoolTab(req.nextUrl.searchParams.get("tab")),
      tags: parseOpsMatchingTags(req.nextUrl.searchParams.get("tags")),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load matching talent pool"
    );
  }
}
