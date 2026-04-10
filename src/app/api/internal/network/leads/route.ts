import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchNetworkLeadPage,
  parseLeadBoolean,
  parseLeadFilterValue,
  parseLeadLimit,
  parseLeadOffset,
  parseLeadQuery,
} from "@/lib/opsNetworkServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const limit = parseLeadLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseLeadOffset(req.nextUrl.searchParams.get("offset"));
    const query = parseLeadQuery(req.nextUrl.searchParams.get("query"));
    const role = parseLeadFilterValue(req.nextUrl.searchParams.get("role"));
    const move = parseLeadFilterValue(req.nextUrl.searchParams.get("move"));
    const cvOnly = parseLeadBoolean(req.nextUrl.searchParams.get("cvOnly"));

    const payload = await fetchNetworkLeadPage({
      cvOnly,
      limit,
      move,
      offset,
      query,
      role,
      userEmail: user.email ?? null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load network leads");
  }
}
