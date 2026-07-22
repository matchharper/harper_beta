import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsOfficialJobCompanyOptions } from "@/lib/ops/officialJobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsOfficialJobCompanyOptions());
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load internal company workspaces"
    );
  }
}
