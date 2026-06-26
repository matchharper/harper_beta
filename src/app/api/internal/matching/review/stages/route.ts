import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  createOpsMatchingRoleReviewStage,
  deleteOpsMatchingRoleReviewStage,
  fetchOpsMatchingRoleReviewStages,
  updateOpsMatchingRoleReviewStage,
} from "@/lib/ops/matching";

export const runtime = "nodejs";

type ReviewStageBody = {
  label?: unknown;
  roleId?: string;
  stageId?: string;
};

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const roleId = req.nextUrl.searchParams.get("roleId")?.trim() ?? "";
    if (!roleId) throw new InternalApiError(400, "roleId is required");

    const stages = await fetchOpsMatchingRoleReviewStages({ roleId });
    return NextResponse.json({ roleId, stages });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to load matching review stages"
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ReviewStageBody;
    const roleId = String(body.roleId ?? "").trim();
    if (!roleId) throw new InternalApiError(400, "roleId is required");
    if (typeof body.label !== "string") {
      throw new InternalApiError(400, "label is required");
    }

    const payload = await createOpsMatchingRoleReviewStage({
      label: body.label,
      roleId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to create matching review stage"
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ReviewStageBody;
    const roleId = String(body.roleId ?? "").trim();
    const stageId = String(body.stageId ?? "").trim();
    if (!roleId) throw new InternalApiError(400, "roleId is required");
    if (!stageId) throw new InternalApiError(400, "stageId is required");
    if (typeof body.label !== "string") {
      throw new InternalApiError(400, "label is required");
    }

    const payload = await updateOpsMatchingRoleReviewStage({
      label: body.label,
      roleId,
      stageId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update matching review stage"
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as ReviewStageBody;
    const roleId = String(body.roleId ?? "").trim();
    const stageId = String(body.stageId ?? "").trim();
    if (!roleId) throw new InternalApiError(400, "roleId is required");
    if (!stageId) throw new InternalApiError(400, "stageId is required");

    const payload = await deleteOpsMatchingRoleReviewStage({
      roleId,
      stageId,
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to delete matching review stage"
    );
  }
}
