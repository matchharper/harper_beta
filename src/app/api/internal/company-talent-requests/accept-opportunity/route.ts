import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

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
      .select("id, company_role:company_roles!inner(source_type, status)")
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
      String(role.status ?? "")
        .trim()
        .toLowerCase() === "ended"
    ) {
      return NextResponse.json(
        { error: "internal_opportunity_ended" },
        { status: 409 }
      );
    }

    const acceptedAt = new Date().toISOString();
    const { error: updateError } = await (
      admin.from("talent_opportunity_recommendation" as any) as any
    )
      .update({
        email_acceptance_confirmation: confirmation,
        feedback: "like",
        feedback_at: acceptedAt,
        feedback_reason:
          String(body.feedbackReason ?? "")
            .trim()
            .slice(0, 1_000) || null,
        saved_stage: "connected",
        updated_at: acceptedAt,
      })
      .eq("id", recommendationId)
      .eq("talent_id", talentId);
    if (updateError) throw updateError;
    return NextResponse.json({
      acceptedAt,
      ok: true,
      recommendationId,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to accept internal opportunity"
    );
  }
}
