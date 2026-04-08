import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { fetchMatchWorkspace, saveMatchRole } from "@/lib/match/server";
import { type MatchEmploymentType, type MatchRoleStatus } from "@/lib/match/shared";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";

type RoleBody = {
  companyWorkspaceId?: string | null;
  description?: string | null;
  employmentTypes?: MatchEmploymentType[];
  externalJdUrl?: string | null;
  information?: Json | null;
  name?: string;
  roleId?: string | null;
  status?: MatchRoleStatus;
};

async function handleUpsert(req: NextRequest) {
  const user = await requireAuthenticatedUser(req);
  const body = (await req.json().catch(() => ({}))) as RoleBody;

  const role = await saveMatchRole({
    companyWorkspaceId: body.companyWorkspaceId,
    description: body.description,
    employmentTypes: body.employmentTypes,
    externalJdUrl: body.externalJdUrl,
    information: body.information,
    name: String(body.name ?? ""),
    roleId: body.roleId,
    status: body.status,
    userId: user.id,
  });

  const workspace = await fetchMatchWorkspace({
    userId: user.id,
    workspaceId: role.companyWorkspaceId,
  });

  return NextResponse.json({
    role,
    workspace,
  });
}

export async function POST(req: NextRequest) {
  try {
    return await handleUpsert(req);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create role";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleUpsert(req);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
