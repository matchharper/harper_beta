import { NextRequest, NextResponse } from "next/server";
import {
  InternalApiError,
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { updateOpsCompanyRoleCompanyFirstSearch } from "@/lib/ops/company";

export const runtime = "nodejs";

type RoleAutomationBody = {
  isCompanyFirstSearch?: unknown;
  roleId?: unknown;
  workspaceId?: unknown;
};

export async function PATCH(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as RoleAutomationBody;
    if (typeof body.isCompanyFirstSearch !== "boolean") {
      throw new InternalApiError(
        400,
        "isCompanyFirstSearch must be a boolean"
      );
    }
    const data = await updateOpsCompanyRoleCompanyFirstSearch({
      isCompanyFirstSearch: body.isCompanyFirstSearch,
      roleId: String(body.roleId ?? ""),
      workspaceId: String(body.workspaceId ?? ""),
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "Failed to update role company-first search"
    );
  }
}
