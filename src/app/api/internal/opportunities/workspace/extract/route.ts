import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { extractOpsOpportunityWorkspace } from "@/lib/opsOpportunity";

export const runtime = "nodejs";

type WorkspaceExtractBody = {
  linkedinUrl?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as WorkspaceExtractBody;
    const workspace = await extractOpsOpportunityWorkspace({
      linkedinUrl: String(body.linkedinUrl ?? ""),
    });

    return NextResponse.json({ workspace });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to extract company");
  }
}
