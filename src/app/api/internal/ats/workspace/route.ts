import { NextRequest, NextResponse } from "next/server";
import {
  requireAtsApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { fetchAtsWorkspace, saveAtsWorkspace } from "@/lib/ats/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  let userEmail: string | null | undefined;
  let userId: string | null = null;

  try {
    const user = await requireAtsApiUser(req);
    userEmail = user.email;
    userId = user.id;
    const data = await fetchAtsWorkspace({
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/internal/ats/workspace][GET] failed", {
      error: error instanceof Error ? error.message : "unknown_workspace_error",
      stack: error instanceof Error ? error.stack : undefined,
      userEmail: userEmail ?? null,
      userId,
    });
    return toInternalApiErrorResponse(error, "Failed to load ATS workspace");
  }
}

export async function PATCH(req: NextRequest) {
  let userEmail: string | null | undefined;
  let userId: string | null = null;

  try {
    const user = await requireAtsApiUser(req);
    userEmail = user.email;
    userId = user.id;
    const body = (await req.json().catch(() => ({}))) as {
      bookmarkFolderId?: number | null;
      companyPitch?: string;
      jobDescription?: string;
      senderEmail?: string;
      signature?: string;
    };

    const workspace = await saveAtsWorkspace({
      bookmarkFolderId: body.bookmarkFolderId,
      companyPitch: body.companyPitch,
      jobDescription: body.jobDescription,
      senderEmail: body.senderEmail,
      signature: body.signature,
      userEmail: user.email,
      userId: user.id,
    });

    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    console.error("[api/internal/ats/workspace][PATCH] failed", {
      error: error instanceof Error ? error.message : "unknown_workspace_error",
      stack: error instanceof Error ? error.stack : undefined,
      userEmail: userEmail ?? null,
      userId,
    });
    return toInternalApiErrorResponse(error, "Failed to save ATS workspace");
  }
}
