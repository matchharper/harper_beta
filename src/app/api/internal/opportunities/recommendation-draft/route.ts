import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { generateOpsOpportunityRecommendationDraft } from "@/lib/opsOpportunity";
import { OpportunityType, isOpportunityType } from "@/lib/opportunityType";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      opportunityType?: OpportunityType;
      promptTemplate?: string | null;
      roleId?: string;
      talentId?: string;
    };

    const data = await generateOpsOpportunityRecommendationDraft({
      opportunityType: isOpportunityType(body.opportunityType)
        ? body.opportunityType
        : OpportunityType.ExternalJd,
      promptTemplate: body.promptTemplate,
      roleId: String(body.roleId ?? ""),
      talentId: String(body.talentId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to generate recommendation draft"
    );
  }
}
