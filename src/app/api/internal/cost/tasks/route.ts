import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { parseOpsCostDateRange } from "@/lib/ops/costServer";
import { fetchOpsTaskCosts } from "@/lib/ops/taskCostServer";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const range = parseOpsCostDateRange({
      from: req.nextUrl.searchParams.get("from"),
      through: req.nextUrl.searchParams.get("through"),
    });
    return NextResponse.json(
      await fetchOpsTaskCosts(getTalentSupabaseAdmin(), range)
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "태스크 비용을 불러오지 못했습니다."
    );
  }
}
