import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import {
  OrgHttpError,
  setOrgCandidateStage,
  type OrgStageId,
  type OrgStopReason,
} from "@/lib/org/server";

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
      recommendationId?: string;
      introEmails?: string[] | null;
      roleId?: string;
      stage?: OrgStageId;
      stopNote?: string | null;
      stopReason?: OrgStopReason | null;
      talentId?: string;
      workspaceId?: string;
    };
    const payload = await setOrgCandidateStage({
      acceptReason: body.acceptReason ?? null,
      introEmails: body.introEmails ?? null,
      recommendationId: body.recommendationId ?? "",
      roleId: body.roleId ?? "",
      stage: body.stage ?? "pending_connection",
      stopNote: body.stopNote ?? null,
      stopReason: body.stopReason ?? null,
      talentId: body.talentId ?? "",
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
