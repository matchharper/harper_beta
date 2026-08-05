import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getCompanyEventActorLabelFromUser } from "@/lib/org/companyEvents";
import { updateOpsCompanyWorkspace } from "@/lib/ops/company";

export const runtime = "nodejs";

type CompanyWorkspaceBody = {
  careerUrl?: string | null;
  companyDescription?: string | null;
  companyName?: string;
  homepageUrl?: string | null;
  linkedinUrl?: string | null;
  logoUrl?: string | null;
  pitch?: string | null;
  publishedName?: string | null;
  request?: string | null;
  workspaceId?: string;
};

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as CompanyWorkspaceBody;
    const data = await updateOpsCompanyWorkspace({
      careerUrl: body.careerUrl ?? null,
      companyDescription: body.companyDescription ?? null,
      companyName: String(body.companyName ?? ""),
      eventActorLabel: getCompanyEventActorLabelFromUser(user),
      homepageUrl: body.homepageUrl ?? null,
      linkedinUrl: body.linkedinUrl ?? null,
      logoUrl: body.logoUrl ?? null,
      pitch: body.pitch ?? null,
      publishedName: body.publishedName ?? null,
      request: body.request ?? null,
      workspaceId: String(body.workspaceId ?? ""),
    });
    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update company");
  }
}
