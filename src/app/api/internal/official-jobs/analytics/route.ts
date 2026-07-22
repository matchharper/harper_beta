import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsOfficialJobAnalytics } from "@/lib/ops/officialJobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const jobId = req.nextUrl.searchParams.get("jobId") ?? "";
    return NextResponse.json(await fetchOpsOfficialJobAnalytics(jobId));
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load official job analytics"
    );
  }
}
