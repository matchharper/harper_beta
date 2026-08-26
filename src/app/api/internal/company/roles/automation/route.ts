import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { updateOpsCompanyRoleAutomation } from "@/lib/ops/company";

export const runtime = "nodejs";

type RoleAutomationBody = {
  isAuto?: unknown;
  roleId?: unknown;
  workspaceId?: unknown;
};

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as RoleAutomationBody;
    if (typeof body.isAuto !== "boolean") {
      throw new InternalApiError(400, "isAuto must be a boolean");
    }
    const data = await updateOpsCompanyRoleAutomation({
      isAuto: body.isAuto,
      roleId: String(body.roleId ?? ""),
      workspaceId: String(body.workspaceId ?? ""),
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update role automation"
    );
  }
}
