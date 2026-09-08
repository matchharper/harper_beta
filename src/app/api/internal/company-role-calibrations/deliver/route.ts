import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalWorkerSecret,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { notifyOrgRoleCalibrationSlack } from "@/lib/org/slack";
import { getCompanyRoleCalibrationProfiles } from "@/lib/org/roleCalibrationServer";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    requireInternalWorkerSecret(req);
    const body = (await req.json().catch(() => ({}))) as {
      calibrationId?: unknown;
    };
    const calibrationId = text(body.calibrationId);
    if (!calibrationId) {
      return NextResponse.json(
        { error: "calibrationId is required" },
        { status: 400 }
      );
    }
    const admin = getSupabaseAdmin();
    const { data: calibration, error } = await (
      admin.from("company_role_calibrations" as any) as any
    )
      .select(
        "id, company_workspace_id, role_id, status, payload, created_at, updated_at, role:company_roles!inner(name)"
      )
      .eq("id", calibrationId)
      .maybeSingle();
    if (error) throw error;
    if (!calibration) {
      return NextResponse.json(
        { error: "Calibration not found" },
        { status: 404 }
      );
    }
    const delivery =
      calibration.payload && typeof calibration.payload === "object"
        ? (calibration.payload as Record<string, any>).delivery
        : null;
    if (delivery?.status === "sent") {
      return NextResponse.json({
        idempotent: true,
        ok: true,
        status: calibration.status,
      });
    }
    if (!["ready", "completed"].includes(String(calibration.status))) {
      return NextResponse.json(
        { error: "Calibration is not ready for delivery" },
        { status: 409 }
      );
    }
    const { data: eligible, error: eligibleError } = await (admin.rpc as any)(
      "company_role_is_calibration_eligible_v1",
      { p_role_id: calibration.role_id }
    );
    if (eligibleError) throw eligibleError;
    if (eligible !== true) {
      return NextResponse.json(
        { error: "Role is no longer eligible for calibration delivery" },
        { status: 409 }
      );
    }
    const profiles = getCompanyRoleCalibrationProfiles(calibration);
    if (profiles.length < 3 || profiles.length > 5) {
      return NextResponse.json(
        { error: "Calibration has an invalid profile set" },
        { status: 409 }
      );
    }
    const role = Array.isArray(calibration.role)
      ? calibration.role[0]
      : calibration.role;
    let delivered = false;
    let deliveryError: string | null = null;
    try {
      delivered = await notifyOrgRoleCalibrationSlack({
        calibrationId,
        profiles,
        roleId: calibration.role_id,
        roleName: text(role?.name) || "Role",
        workspaceId: calibration.company_workspace_id,
      });
      if (!delivered) deliveryError = "no_active_slack_channel";
    } catch (postError) {
      deliveryError =
        postError instanceof Error
          ? postError.message
          : "slack_delivery_failed";
    }
    const { data: marked, error: markError } = await (admin.rpc as any)(
      "mark_company_role_calibration_delivery_v1",
      {
        p_calibration_id: calibrationId,
        p_delivered: delivered,
        p_error: deliveryError,
      }
    );
    if (markError) throw markError;
    if (deliveryError && deliveryError !== "no_active_slack_channel") {
      throw new Error(deliveryError);
    }
    return NextResponse.json({
      delivered,
      ok: true,
      status: marked?.status ?? calibration.status,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to deliver Role calibration"
    );
  }
}
