import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsCompanyMembers } from "@/lib/ops/company";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const data = await fetchOpsCompanyMembers({
      query: searchParams.get("query") ?? "",
      workspaceId: searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load company members");
  }
}
