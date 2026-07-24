import { NextRequest, NextResponse } from "next/server";
import {
  leaveOrgWorkspace,
  OrgHttpError,
  updateOrgMembershipRole,
} from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

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
  console.error("[org/membership]", error);
  return NextResponse.json(
    { error: "Organization에서 탈퇴하지 못했습니다." },
    { status: 500 }
  );
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: string;
    };
    const payload = await leaveOrgWorkspace({
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
    const body = (await req.json().catch(() => ({}))) as {
      role?: unknown;
      userId?: string;
      workspaceId?: string;
    };
    const payload = await updateOrgMembershipRole({
      role: body.role,
      user,
      userId: body.userId ?? "",
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
