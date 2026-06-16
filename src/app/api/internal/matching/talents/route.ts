import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingTalents,
  parseOpsMatchingDateOnly,
  parseOpsMatchingLimit,
  parseOpsMatchingOffset,
  parseOpsMatchingTags,
} from "@/lib/opsMatching";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const roleId = req.nextUrl.searchParams.get("roleId")?.trim() ?? "";
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    const payload = await fetchOpsMatchingTalents({
      createdFrom: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdFrom")
      ),
      createdTo: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdTo")
      ),
      limit: parseOpsMatchingLimit(req.nextUrl.searchParams.get("limit")),
      offset: parseOpsMatchingOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      roleId,
      tags: parseOpsMatchingTags(req.nextUrl.searchParams.get("tags")),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load matching talents");
  }
}
