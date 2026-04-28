import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { saveOpsOpportunityWorkspace } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

type WorkspaceBody = {
  careerUrl?: string | null;
  companyDescription?: string | null;
  companyName?: string;
  homepageUrl?: string | null;
  isInternal?: boolean | null;
  linkedinUrl?: string | null;
  pitch?: string | null;
  request?: string | null;
  workspaceId?: string | null;
};

async function handleSave(req: NextRequest) {
  await requireInternalApiUser(req);
  const body = (await req.json().catch(() => ({}))) as WorkspaceBody;

  const workspace = await saveOpsOpportunityWorkspace({
    careerUrl: body.careerUrl,
    companyDescription: body.companyDescription,
    companyName: String(body.companyName ?? ""),
    homepageUrl: body.homepageUrl,
    isInternal: body.isInternal === true,
    linkedinUrl: body.linkedinUrl,
    pitch: body.pitch,
    request: body.request,
    workspaceId: body.workspaceId,
  });

  return NextResponse.json({ workspace });
}

export async function POST(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save company");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return await handleSave(req);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update company");
  }
}
