import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  updateOrgConnectionConfirmationEmail,
} from "@/lib/org/server";

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
  console.error("[org/connection-confirmation-email]", error);
  return NextResponse.json(
    { error: "Failed to update connection confirmation email" },
    { status: 500 }
  );
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      queueId?: unknown;
      roleId?: unknown;
      talentId?: unknown;
      workspaceId?: unknown;
    };
    const action = String(body.action ?? "").trim();
    if (action !== "cancel" && action !== "send_now") {
      throw new OrgHttpError(400, "action must be cancel or send_now");
    }
    const payload = await updateOrgConnectionConfirmationEmail({
      action,
      queueId: String(body.queueId ?? ""),
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
