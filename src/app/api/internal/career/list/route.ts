import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCareerTalentList,
  parseCareerListLimit,
  parseCareerListOffset,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const limit = parseCareerListLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseCareerListOffset(req.nextUrl.searchParams.get("offset"));

    const payload = await fetchCareerTalentList({ limit, offset });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load career talents");
  }
}
