import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOpsTalentActionLogs } from "@/lib/ops/talentActionLogsServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const payload = await fetchOpsTalentActionLogs({
      days: req.nextUrl.searchParams.get("days"),
      group: req.nextUrl.searchParams.get("group"),
      signal: req.signal,
      view: req.nextUrl.searchParams.get("view"),
      weeks: req.nextUrl.searchParams.get("weeks"),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load action logs");
  }
}
