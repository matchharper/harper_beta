import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCareerTalentRecommendations,
  parseCareerRecommendationLimit,
  parseCareerRecommendationOffset,
  parseCareerRecommendationSourceFilter,
} from "@/lib/ops/careerServer";

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

    const payload = await fetchCareerTalentRecommendations({
      limit: parseCareerRecommendationLimit(
        req.nextUrl.searchParams.get("limit")
      ),
      offset: parseCareerRecommendationOffset(
        req.nextUrl.searchParams.get("offset")
      ),
      sourceType: parseCareerRecommendationSourceFilter(
        req.nextUrl.searchParams.get("sourceType")
      ),
      userId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load career talent recommendations"
    );
  }
}
