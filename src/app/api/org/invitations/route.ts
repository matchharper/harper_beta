import { NextRequest, NextResponse } from "next/server";
import {
  cancelOrgWorkspaceInvitation,
  OrgHttpError,
  sendOrgWorkspaceInvitations,
} from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

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
  console.error("[org/invitations]", error);
  return NextResponse.json(
    { error: "초대 메일을 보내지 못했습니다." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      emails?: unknown;
      role?: unknown;
      workspaceId?: string;
    };
    const payload = await sendOrgWorkspaceInvitations({
      emails: body.emails,
      role: body.role,
      siteUrl: getPublicSiteUrlFromRequest(req),
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
    const body = (await req.json().catch(() => ({}))) as {
      invitationId?: string;
      workspaceId?: string;
    };
    const payload = await cancelOrgWorkspaceInvitation({
      invitationId: body.invitationId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
