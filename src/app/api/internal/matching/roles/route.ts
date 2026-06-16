import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsMatchingRoles } from "@/lib/opsMatching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const items = await fetchOpsMatchingRoles({
      companyWorkspaceId: req.nextUrl.searchParams.get("companyWorkspaceId"),
    });
    return NextResponse.json({ items });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load matching roles");
  }
}
