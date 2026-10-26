import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  listJobSearchComparisonCases,
  runJobSearchComparison,
} from "@/lib/ops/jobSearchComparison.server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await listJobSearchComparisonCases(), { headers });
  } catch (error) {
    const response = toInternalApiErrorResponse(
      error,
      "테스트셋을 불러오지 못했습니다."
    );
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      await runJobSearchComparison(
        await req.json().catch(() => null),
        req.signal
      ),
      { headers }
    );
  } catch (error) {
    const response = toInternalApiErrorResponse(error, "검색에 실패했습니다.");
    response.headers.set("Cache-Control", headers["Cache-Control"]);
    return response;
  }
}
