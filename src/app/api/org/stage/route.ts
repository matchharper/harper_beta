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
    return NextResponse.json(
      { error: "로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요." },
      { status: 401 }
    );
  }
  console.error("[org/stage]", error);
  return NextResponse.json(
    {
      error:
        "후보자 상태 변경 결과를 확인하지 못했어요. 소개 이메일이나 후보자 안내가 전달됐을 수 있으니 바로 다시 시도하지 말고, 현재 상태와 메일을 먼저 확인해 주세요.",
    },
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
      throw new OrgHttpError(400, "이메일 전달 방식을 확인해 주세요.");
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
