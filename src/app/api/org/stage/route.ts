import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  setOrgCandidateStage,
  type OrgStageId,
} from "@/lib/org/server";
import type { InternalConnectionConfirmationEmailMode } from "@/lib/ops/connectionConfirmationEmail";

function toErrorResponse(error: unknown) {
  if (error instanceof OrgHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.error("[org/stage]", error);
  return NextResponse.json(
    { error: "Failed to update stage" },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      acceptReason?: string | null;
      contactDirectly?: boolean;
      emailMode?: unknown;
      recommendationId?: string;
      introEmails?: string[] | null;
      roleId?: string;
      stage?: OrgStageId;
      stopNote?: string | null;
      talentId?: string;
      workspaceId?: string;
    };
    const emailMode = String(body.emailMode ?? "schedule").trim();
    if (!["schedule", "send_now", "skip"].includes(emailMode)) {
      throw new OrgHttpError(400, "emailMode is invalid");
    }
    const payload = await setOrgCandidateStage({
      acceptReason: body.acceptReason ?? null,
      contactDirectly: body.contactDirectly === true,
      emailMode: emailMode as InternalConnectionConfirmationEmailMode,
      introEmails: body.introEmails ?? null,
      recommendationId: body.recommendationId ?? "",
      roleId: body.roleId ?? "",
      stage: body.stage ?? "pending_connection",
      stopNote: body.stopNote ?? null,
      talentId: body.talentId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
