import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { runCompanyFitDebug } from "@/lib/ops/companyFitDebug";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(
      await runCompanyFitDebug(await req.json().catch(() => null)),
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const response = toInternalApiErrorResponse(error, "회사 평가에 실패했습니다.");
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
