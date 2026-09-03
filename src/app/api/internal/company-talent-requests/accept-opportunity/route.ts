import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  InternalRoleAcceptanceError,
  updateTalentOpportunityHistoryItem,
} from "@/lib/talentOpportunity";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json()) as Record<string, unknown>;
    const talentId = String(body.talentId ?? "").trim();
    const recommendationId = String(body.recommendationId ?? "").trim();
    if (!talentId || !recommendationId) {
      return NextResponse.json(
        { error: "talentId and recommendationId are required" },
        { status: 400 }
      );
    }
    const confirmation =
      body.emailAcceptanceConfirmation &&
      typeof body.emailAcceptanceConfirmation === "object" &&
      !Array.isArray(body.emailAcceptanceConfirmation)
        ? (body.emailAcceptanceConfirmation as Record<string, unknown>)
        : {};
    if (JSON.stringify(confirmation).length > 4_000) {
      return NextResponse.json(
        { error: "emailAcceptanceConfirmation is too large" },
        { status: 400 }
      );
    }
    const admin = getTalentSupabaseAdmin();
    const { data: recommendation, error: findError } = await (
      admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select(
        "id, company_role:company_roles!inner(source_type, status, is_expired, expires_at, information)"
      )
      .eq("id", recommendationId)
      .eq("talent_id", talentId)
      .maybeSingle();
    if (findError) throw findError;
    const role = Array.isArray(recommendation?.company_role)
      ? recommendation.company_role[0]
      : recommendation?.company_role;
    if (!recommendation?.id || role?.source_type !== "internal") {
      return NextResponse.json(
        { error: "internal_opportunity_not_found" },
        { status: 404 }
      );
    }
    const expiresAtMs = Date.parse(String(role.expires_at ?? ""));
    const roleInformation =
      role.information &&
      typeof role.information === "object" &&
      !Array.isArray(role.information)
        ? (role.information as Record<string, unknown>)
        : {};
    if (
      String(role.status ?? "").trim().toLowerCase() !== "active" ||
      role.is_expired === true ||
      (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) ||
      roleInformation.testOnly === true ||
      String(roleInformation.testOnly ?? "").trim().toLowerCase() === "true"
    ) {
      return NextResponse.json(
        { error: "internal_opportunity_unavailable" },
        { status: 409 }
      );
    }

    const result = await updateTalentOpportunityHistoryItem({
      action: "feedback",
      admin,
      emailAcceptanceConfirmation: confirmation as Json,
      feedback: "positive",
      feedbackReason:
        String(body.feedbackReason ?? "")
          .trim()
          .slice(0, 1_000) || null,
      opportunityId: recommendationId,
      savedStage: "connected",
      userId: talentId,
    });
    return NextResponse.json({
      acceptedAt: result.updatedAt,
      ok: true,
      recommendationId,
    });
  } catch (error) {
    if (
      error instanceof InternalRoleAcceptanceError &&
      error.reason === "target_role_unavailable"
    ) {
      return NextResponse.json(
        { error: "internal_opportunity_unavailable" },
        { status: 409 }
      );
    }
    return toInternalApiErrorResponse(
      error,
      "Failed to accept internal opportunity"
    );
  }
}
