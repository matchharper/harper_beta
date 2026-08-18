import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchOrgBoard, fetchOrgBootstrap } from "@/lib/org/server";

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
    return NextResponse.json({
      board,
      roles: bootstrap.roles,
      workspace: bootstrap.workspace,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load company roles");
  }
}
