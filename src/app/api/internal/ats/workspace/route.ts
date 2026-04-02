import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchAtsWorkspace, saveAtsWorkspace } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const data = await fetchAtsWorkspace({
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load ATS workspace");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      companyPitch?: string;
      jobDescription?: string;
      senderEmail?: string;
      signature?: string;
    };

    const workspace = await saveAtsWorkspace({
      companyPitch: body.companyPitch,
      jobDescription: body.jobDescription,
      senderEmail: body.senderEmail,
      signature: body.signature,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save ATS workspace");
  }
}
