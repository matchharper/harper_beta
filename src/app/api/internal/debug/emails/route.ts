import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsDebugEmails,
  parseOpsDebugEmailDirection,
  parseOpsDebugEmailLimit,
  parseOpsDebugEmailOffset,
  parseOpsDebugEmailScope,
} from "@/lib/ops/debugEmailServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const payload = await fetchOpsDebugEmails({
      direction: parseOpsDebugEmailDirection(
        req.nextUrl.searchParams.get("direction")
      ),
      limit: parseOpsDebugEmailLimit(req.nextUrl.searchParams.get("limit")),
      mailType: req.nextUrl.searchParams.get("mailType"),
      occurredFrom: req.nextUrl.searchParams.get("occurredFrom"),
      occurredTo: req.nextUrl.searchParams.get("occurredTo"),
      offset: parseOpsDebugEmailOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      scope: parseOpsDebugEmailScope(req.nextUrl.searchParams.get("scope")),
      status: req.nextUrl.searchParams.get("status"),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load debug emails");
  }
}
