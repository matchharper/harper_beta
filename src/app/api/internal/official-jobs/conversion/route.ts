import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { normalizeJobsConversionDays } from "@/lib/ops/officialJobsConversion";
import { fetchOpsOfficialJobsConversion } from "@/lib/ops/officialJobsConversion.server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const days = normalizeJobsConversionDays(
      req.nextUrl.searchParams.get("days")
    );
    return NextResponse.json({
      conversion: await fetchOpsOfficialJobsConversion(days),
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load official jobs conversion"
    );
  }
}
