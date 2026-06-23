import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsDebugCalls,
  parseOpsDebugCallLimit,
  parseOpsDebugCallOffset,
  parseOpsDebugCallStatus,
} from "@/lib/ops/debugCallServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const payload = await fetchOpsDebugCalls({
      kind: req.nextUrl.searchParams.get("kind"),
      limit: parseOpsDebugCallLimit(req.nextUrl.searchParams.get("limit")),
      offset: parseOpsDebugCallOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      startedFrom: req.nextUrl.searchParams.get("startedFrom"),
      startedTo: req.nextUrl.searchParams.get("startedTo"),
      status: parseOpsDebugCallStatus(req.nextUrl.searchParams.get("status")),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load debug calls");
  }
}
