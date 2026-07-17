import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  createOrgRoleReviewStage,
  deleteOrgRoleReviewStage,
  OrgHttpError,
  updateOrgRoleReviewStage,
} from "@/lib/org/server";

type OrgStageBody = {
  label?: unknown;
  roleId?: string;
  stageId?: string;
  workspaceId?: string;
};

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/stages]", error);
  return NextResponse.json(
    { error: "Failed to update stages" },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as OrgStageBody;
    const payload = await createOrgRoleReviewStage({
      label: body.label,
      roleId: body.roleId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as OrgStageBody;
    const payload = await updateOrgRoleReviewStage({
      label: body.label,
      roleId: body.roleId ?? "",
      stageId: body.stageId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as OrgStageBody;
    const payload = await deleteOrgRoleReviewStage({
      roleId: body.roleId ?? "",
      stageId: body.stageId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
