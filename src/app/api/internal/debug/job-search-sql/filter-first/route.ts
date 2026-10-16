import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runJobSearchFilter } from "@/lib/ops/jobSearchFilter.server";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      await runJobSearchFilter(await req.json().catch(() => null), req.signal),
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    const response = toInternalApiErrorResponse(error, "검색에 실패했습니다.");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
