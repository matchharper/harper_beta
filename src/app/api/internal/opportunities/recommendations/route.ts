import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  deleteOpsOpportunityRecommendation,
  fetchOpsOpportunityRecommendations,
  saveOpsOpportunityRecommendation,
} from "@/lib/opsOpportunity";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const { searchParams } = new URL(req.url);
    const roleId = String(searchParams.get("roleId") ?? "").trim() || null;
    const talentId = String(searchParams.get("talentId") ?? "").trim() || null;

    const data = await fetchOpsOpportunityRecommendations({
      roleId,
      talentId,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load recommendations");
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      recommendationMemo?: string | null;
      roleId?: string;
      talentId?: string;
    };

    const data = await saveOpsOpportunityRecommendation({
      recommendationMemo: body.recommendationMemo,
      roleId: String(body.roleId ?? ""),
      talentId: String(body.talentId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save recommendation");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      roleId?: string;
      talentId?: string;
    };

    const data = await deleteOpsOpportunityRecommendation({
      roleId: String(body.roleId ?? ""),
      talentId: String(body.talentId ?? ""),
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to delete recommendation");
  }
}
