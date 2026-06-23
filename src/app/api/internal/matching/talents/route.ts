import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchOpsMatchingTalents,
  parseOpsMatchingDateOnly,
  parseOpsMatchingFitLabels,
  parseOpsMatchingHumanLabelFilters,
  parseOpsMatchingLimit,
  parseOpsMatchingOffset,
  parseOpsMatchingTags,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

function parseBooleanParam(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const roleId = req.nextUrl.searchParams.get("roleId")?.trim() ?? "";
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    const payload = await fetchOpsMatchingTalents({
      createdFrom: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdFrom")
      ),
      createdTo: parseOpsMatchingDateOnly(
        req.nextUrl.searchParams.get("createdTo")
      ),
      excludeRecommended: parseBooleanParam(
        req.nextUrl.searchParams.get("excludeRecommended")
      ),
      humanLabels: parseOpsMatchingHumanLabelFilters(
        req.nextUrl.searchParams.get("humanLabels")
      ),
      limit: parseOpsMatchingLimit(req.nextUrl.searchParams.get("limit")),
      llmLabels: parseOpsMatchingFitLabels(
        req.nextUrl.searchParams.get("llmLabels")
      ),
      offset: parseOpsMatchingOffset(req.nextUrl.searchParams.get("offset")),
      query: req.nextUrl.searchParams.get("query"),
      roleId,
      tags: parseOpsMatchingTags(req.nextUrl.searchParams.get("tags")),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load matching talents");
  }
}
