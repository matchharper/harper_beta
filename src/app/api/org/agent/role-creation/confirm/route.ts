import { billingErrorResponse } from "@/lib/org/billing/http";
import { NextRequest, NextResponse } from "next/server";
import { confirmRoleCreationChoice } from "@/lib/org/agent/roleCreationConfirmation";
import type { OrgRoleCreationConfirmationBody } from "@/lib/org/agent/types";
import { isOrgLocale } from "@/i18n/org/locale";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

export const maxDuration = 180;

function errorResponse(error: unknown) {
  const billing = billingErrorResponse(error);
  if (billing) return billing;
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  console.error("[org/agent/role-creation/confirm]", error);
  return NextResponse.json(
    { error: "역할 완료 처리를 하지 못했습니다." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req
      .json()
      .catch(() => ({}))) as OrgRoleCreationConfirmationBody;
    if (body.decision !== "yes" && body.decision !== "no") {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }
    if (body.responseLocale != null && !isOrgLocale(body.responseLocale)) {
      return NextResponse.json(
        { error: "Invalid response locale" },
        { status: 400 }
      );
    }
    const result = await confirmRoleCreationChoice({
      actionId: body.actionId ?? "",
      decision: body.decision,
      messageId: Number(body.messageId),
      roleId: body.roleId ?? "",
      responseLocale: body.responseLocale,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
