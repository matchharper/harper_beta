import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { searchOpsOpportunityCandidates } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const query = String(searchParams.get("query") ?? "").trim();
    const roleId = String(searchParams.get("roleId") ?? "").trim() || null;
    const limit = Number(searchParams.get("limit") ?? "20");

    const data = await searchOpsOpportunityCandidates({
      limit,
      query,
      roleId,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to search candidates");
  }
}
