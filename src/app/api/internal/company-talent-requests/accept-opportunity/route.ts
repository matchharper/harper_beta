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
import { isInternalRoleCandidateDecisionAvailable } from "@/lib/career/internalOpportunityDecision";
import { OrgHttpError } from "@/lib/org/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json()) as Record<string, unknown>;
    const talentId = String(body.talentId ?? "").trim();
    const recommendationId = String(body.recommendationId ?? "").trim();
    const decision =
      String(body.decision ?? "accept")
        .trim()
        .toLowerCase() === "decline"
        ? "decline"
        : "accept";
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
    const admin = getTalentSupabaseAdmin();
    const { data: recommendation, error: findError } = await (
      admin.from("talent_opportunity_recommendation" as any) as any
    )
      .select(
        "id, opportunity_type, company_role:company_roles!inner(source_type, status, is_expired, expires_at, information)"
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
    if (
      decision === "decline" &&
      recommendation.opportunity_type !== "intro_request"
    ) {
      return NextResponse.json(
        { error: "decline_is_only_supported_for_intro_request" },
        { status: 400 }
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
      recommendation.opportunity_type !== "intro_request" &&
      (!isInternalRoleCandidateDecisionAvailable(role.status) ||
        role.is_expired === true ||
        (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) ||
        roleInformation.testOnly === true ||
        String(roleInformation.testOnly ?? "")
          .trim()
          .toLowerCase() === "true")
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
      feedback: decision === "decline" ? "negative" : "positive",
      feedbackReason:
        String(body.feedbackReason ?? "")
          .trim()
          .slice(0, 1_000) || null,
      opportunityId: recommendationId,
      savedStage: decision === "accept" ? "connected" : null,
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
    if (error instanceof OrgHttpError && error.status === 409) {
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
