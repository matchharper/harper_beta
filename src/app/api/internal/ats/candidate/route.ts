import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchAtsCandidateDetail } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const candidId = String(searchParams.get("candidId") ?? "").trim();

    if (!candidId) {
      return NextResponse.json(
        { error: "candidId is required" },
        { status: 400 }
      );
    }

    const data = await fetchAtsCandidateDetail({
      candidId,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load ATS candidate");
  }
}
