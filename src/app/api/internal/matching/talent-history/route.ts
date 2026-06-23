import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingTalentHistory,
  parseOpsMatchingTalentHistorySections,
  parseOpsMatchingTalentIds,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsMatchingTalentHistory({
      sections: parseOpsMatchingTalentHistorySections(
        req.nextUrl.searchParams.get("sections")
      ),
      talentIds: parseOpsMatchingTalentIds(
        req.nextUrl.searchParams.get("talentIds")
      ),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load matching talent history"
    );
  }
}
