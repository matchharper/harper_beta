import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { cancelOrgCompanyTalentRequest, OrgHttpError } from "@/lib/org/server";

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
  console.error("[org/company-talent-request]", error);
  return NextResponse.json(
    { error: "Failed to cancel company talent request" },
    { status: 500 }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      requestId?: unknown;
      roleId?: unknown;
      talentId?: unknown;
      workspaceId?: unknown;
    };
    if (String(body.action ?? "").trim() !== "cancel") {
      throw new OrgHttpError(400, "action must be cancel");
    }
    const payload = await cancelOrgCompanyTalentRequest({
      requestId: String(body.requestId ?? ""),
      roleId: String(body.roleId ?? ""),
      talentId: String(body.talentId ?? ""),
      user,
      workspaceId: String(body.workspaceId ?? ""),
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
