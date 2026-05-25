import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsInternalRecommendations,
  parseOpsInternalRecommendationAcceptedFilter,
  parseOpsInternalRecommendationLimit,
  parseOpsInternalRecommendationOffset,
  updateOpsInternalRecommendationProcessedStages,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

type PatchBody = {
  updates?: Array<{
    processedStage?: string | null;
    recommendationId?: string;
  }>;
};

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const payload = await fetchOpsInternalRecommendations({
      acceptedFilter: parseOpsInternalRecommendationAcceptedFilter(
        req.nextUrl.searchParams.get("acceptedFilter")
      ),
      limit: parseOpsInternalRecommendationLimit(
        req.nextUrl.searchParams.get("limit")
      ),
      offset: parseOpsInternalRecommendationOffset(
        req.nextUrl.searchParams.get("offset")
      ),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load internal recommendations"
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as PatchBody;

    if (!Array.isArray(body.updates)) {
      return NextResponse.json(
        { error: "updates must be an array" },
        { status: 400 }
      );
    }

    const invalidUpdate = body.updates.find(
      (update) =>
        typeof update?.recommendationId !== "string" ||
        (update.processedStage !== null &&
          update.processedStage !== undefined &&
          typeof update.processedStage !== "string")
    );
    if (invalidUpdate) {
      return NextResponse.json(
        {
          error:
            "Each update requires recommendationId and processedStage string or null",
        },
        { status: 400 }
      );
    }

    const payload = await updateOpsInternalRecommendationProcessedStages({
      updates: body.updates.map((update) => ({
        processedStage: update.processedStage ?? null,
        recommendationId: update.recommendationId ?? "",
      })),
    });

    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update internal recommendations"
    );
  }
}
