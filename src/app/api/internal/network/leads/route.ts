import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchNetworkLeadPage,
  parseLeadLimit,
  parseLeadOffset,
} from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const limit = parseLeadLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseLeadOffset(req.nextUrl.searchParams.get("offset"));

    const payload = await fetchNetworkLeadPage({
      limit,
      offset,
      userEmail: user.email ?? null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load network leads");
  }
}
