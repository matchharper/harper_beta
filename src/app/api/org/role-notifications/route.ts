import { NextRequest, NextResponse } from "next/server";
import {
  fetchOrgRoleNotificationSettings,
  updateOrgRoleNotificationSettings,
} from "@/lib/org/roleNotifications";
import type { OrgRoleNotificationSettingsUpdate } from "@/lib/org/roleNotificationTypes";
import { OrgHttpError } from "@/lib/org/server";
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
  console.error("[org/role-notifications]", error);
  return NextResponse.json(
    { error: "Role 알림 설정을 처리하지 못했습니다." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const payload = await fetchOrgRoleNotificationSettings({
      roleId: req.nextUrl.searchParams.get("roleId") ?? "",
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req
      .json()
      .catch(() => ({}))) as Partial<OrgRoleNotificationSettingsUpdate>;
    const payload = await updateOrgRoleNotificationSettings({
      assigneeUserIds: body.assigneeUserIds,
      channels: body.channels,
      roleId: body.roleId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
