import { NextRequest, NextResponse } from "next/server";
import { OrgHttpError, updateOrgMemberProfile } from "@/lib/org/server";
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
  console.error("[org/member-profile]", error);
  return NextResponse.json(
    { error: "멤버 프로필을 저장하지 못했습니다." },
    { status: 500 }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      firstName?: unknown;
      lastName?: unknown;
      role?: unknown;
      userId?: string;
      workspaceId?: string;
    };
    const payload = await updateOrgMemberProfile({
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      user,
      userId: body.userId,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
