import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsOfficialJobInternalRoleOptions } from "@/lib/ops/officialJobs";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    return NextResponse.json(await fetchOpsOfficialJobInternalRoleOptions());
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load internal roles");
  }
}
