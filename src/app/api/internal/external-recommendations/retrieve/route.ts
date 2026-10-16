import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { externalRetrievalRequestSchema } from "@/lib/externalRecommendationsV2/searchRequest";
import { retrieveRoles } from "@/lib/externalRecommendationsV2/retrieval";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const input = externalRetrievalRequestSchema.safeParse(
      await req.json().catch(() => null)
    );
    if (!input.success)
      return NextResponse.json(
        { error: "Invalid retrieval request" },
        { status: 400 }
      );
    const { rows } = await retrieveRoles({
      ...input.data,
      admin: getTalentSupabaseAdmin(),
      signal: req.signal,
    });
    return NextResponse.json(
      { rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return toInternalApiErrorResponse(error, "External retrieval failed");
  }
}
