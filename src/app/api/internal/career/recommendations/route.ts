import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCareerTalentRecommendations,
  parseCareerRecommendationLimit,
  parseCareerRecommendationOffset,
  updateCareerTalentRecommendationProcessedStage,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

type PatchBody = {
  processedStage?: string | null;
  recommendationId?: string;
};

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

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as PatchBody;
    const recommendationId = String(body.recommendationId ?? "").trim();

    if (!recommendationId) {
      return NextResponse.json(
        { error: "recommendationId is required" },
        { status: 400 }
      );
    }

    if (
      body.processedStage !== null &&
      body.processedStage !== undefined &&
      typeof body.processedStage !== "string"
    ) {
      return NextResponse.json(
        { error: "processedStage must be a string or null" },
        { status: 400 }
      );
    }

    const payload = await updateCareerTalentRecommendationProcessedStage({
      processedStage: body.processedStage ?? null,
      recommendationId,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update career talent recommendation"
    );
  }
}
