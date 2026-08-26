import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOrgBoard, fetchOrgBootstrap } from "@/lib/org/server";
import { fetchOpsCompanyRoleAutomationStates } from "@/lib/ops/company";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const workspaceId = req.nextUrl.searchParams.get("workspaceId") ?? "";
    const [bootstrap, board] = await Promise.all([
      fetchOrgBootstrap({
        allowInternalOpsAccess: true,
        orgId: workspaceId,
        user,
      }),
      fetchOrgBoard({
        allowInternalOpsAccess: true,
        includeProfileLabels: false,
        user,
        workspaceId,
      }),
    ]);
    const automationStates = await fetchOpsCompanyRoleAutomationStates({
      roleIds: bootstrap.roles.map((role) => role.roleId),
    });
    const automationByRoleId = new Map(
      automationStates.map((state) => [state.roleId, state.isAuto])
    );
    return NextResponse.json({
      board,
      roles: bootstrap.roles.map((role) => ({
        ...role,
        isAuto: automationByRoleId.get(role.roleId) ?? false,
      })),
      workspace: bootstrap.workspace,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load company roles");
  }
}
