import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchCompanyDashboard } from "@/lib/ops/companyDashboard.server";
export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
    if (![7, 30, 90].includes(days))
      return NextResponse.json({ error: "Invalid range" }, { status: 400 });
    const directoryIds = req.nextUrl.searchParams
      .get("directoryIds")
      ?.split(",")
      .filter(Boolean);
    if (
      directoryIds &&
      (directoryIds.length > 100 ||
        directoryIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
    )
      return NextResponse.json({ error: "Invalid companies" }, { status: 400 });
    return NextResponse.json(
      await fetchCompanyDashboard(
        days,
        req.nextUrl.searchParams.get("workspaceId") || undefined,
        directoryIds
      )
    );
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "회사 통계를 불러오지 못했습니다."
    );
  }
}
