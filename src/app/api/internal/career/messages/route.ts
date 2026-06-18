import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchCareerTalentMessages } from "@/lib/ops/careerServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    return NextResponse.json(await fetchCareerTalentMessages(userId));
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load talent messages"
    );
  }
}
