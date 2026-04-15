import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { syncOpsOpportunityRoles } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

type RoleSyncBody = {
  careerUrl?: string | null;
  workspaceId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as RoleSyncBody;
    const result = await syncOpsOpportunityRoles({
      careerUrl: body.careerUrl,
      workspaceId: String(body.workspaceId ?? ""),
    });

    return NextResponse.json({ result });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to sync roles");
  }
}
