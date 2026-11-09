import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "@/lib/org/httpError";
import { updateOrgSlackChannelRoleAssignments } from "@/lib/org/slackChannelRoles.server";

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const payload = await updateOrgSlackChannelRoleAssignments({
      workspaceId: body.workspaceId,
      channelId: body.channelId,
      roles: body.roles,
      user,
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[org/slack/channel-roles]", error);
    return NextResponse.json({ error: "Role 할당을 저장하지 못했어요." }, { status: 500 });
  }
}
