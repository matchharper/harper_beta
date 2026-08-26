import { type NextRequest, NextResponse } from "next/server";
import { prepareMeetingInvitationPreview } from "@/lib/meetings/invitationServer";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

type RouteContext = { params: Promise<{ scheduleId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { scheduleId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: string;
    };
    return NextResponse.json(
      await prepareMeetingInvitationPreview({
        scheduleId,
        user,
        workspaceId: body.workspaceId ?? "",
      })
    );
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "로그인이 필요해요." },
        { status: 401 }
      );
    }
    console.error("[org/meeting-schedules/invitation-preview]", error);
    return NextResponse.json(
      {
        error:
          "후보자에게 보낼 메일을 준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 }
    );
  }
}
