import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchCareerTalentDetail } from "@/lib/opsCareerServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const userId = req.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    const payload = await fetchCareerTalentDetail(userId);
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load talent detail");
  }
}
