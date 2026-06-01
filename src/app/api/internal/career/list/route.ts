import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  fetchCareerTalentList,
  parseCareerListBoolean,
  parseCareerListDateOnly,
  parseCareerListLimit,
  parseCareerListOffset,
  parseCareerListSearchQuery,
} from "@/lib/opsCareerServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const limit = parseCareerListLimit(req.nextUrl.searchParams.get("limit"));
    const offset = parseCareerListOffset(req.nextUrl.searchParams.get("offset"));
    const query = parseCareerListSearchQuery(
      req.nextUrl.searchParams.get("query")
    );
    const createdFrom = parseCareerListDateOnly(
      req.nextUrl.searchParams.get("createdFrom")
    );
    const createdTo = parseCareerListDateOnly(
      req.nextUrl.searchParams.get("createdTo")
    );
    const onboardingDoneOnly = parseCareerListBoolean(
      req.nextUrl.searchParams.get("onboardingDoneOnly")
    );
    const submittedMaterialOnly = parseCareerListBoolean(
      req.nextUrl.searchParams.get("submittedMaterialOnly")
    );
    const includeExpandedProfile = parseCareerListBoolean(
      req.nextUrl.searchParams.get("includeExpandedProfile")
    );

    const payload = await fetchCareerTalentList({
      createdFrom,
      createdTo,
      includeExpandedProfile,
      limit,
      offset,
      onboardingDoneOnly,
      query,
      submittedMaterialOnly,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load career talents");
  }
}
