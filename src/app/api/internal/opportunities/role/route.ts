import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  saveOpsOpportunityRole,
  type OpportunityEmploymentType,
  type OpportunitySourceType,
  type OpportunityStatus,
  type OpportunityWorkMode,
} from "@/lib/opsOpportunity";

export const runtime = "nodejs";

type RoleBody = {
  companyWorkspaceId?: string | null;
  description?: string | null;
  descriptionSummary?: string | null;
  employmentTypes?: OpportunityEmploymentType[];
  expiresAt?: string | null;
  externalJdUrl?: string | null;
  locationText?: string | null;
  name?: string;
  postedAt?: string | null;
  roleId?: string | null;
  sourceJobId?: string | null;
  sourceProvider?: string | null;
  sourceType?: OpportunitySourceType | null;
  status?: OpportunityStatus | null;
  workMode?: OpportunityWorkMode | null;
};

async function handleSave(req: NextRequest) {
  await requireInternalApiUser(req);
  const body = (await req.json().catch(() => ({}))) as RoleBody;

  const role = await saveOpsOpportunityRole({
    companyWorkspaceId: body.companyWorkspaceId,
    description: body.description,
    descriptionSummary: body.descriptionSummary,
    employmentTypes: body.employmentTypes,
    expiresAt: body.expiresAt,
    externalJdUrl: body.externalJdUrl,
    locationText: body.locationText,
    name: String(body.name ?? ""),
    postedAt: body.postedAt,
    roleId: body.roleId,
    sourceJobId: body.sourceJobId,
    sourceProvider: body.sourceProvider,
    sourceType: body.sourceType,
    status: body.status,
    workMode: body.workMode,
  });

  return NextResponse.json({ role });
}

export async function POST(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save role");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update role");
  }
}
