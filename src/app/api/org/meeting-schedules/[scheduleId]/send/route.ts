import { type NextRequest, NextResponse } from "next/server";
import { queueMeetingInvitation } from "@/lib/meetings/invitationServer";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";
import { getPublicSiteUrlFromRequest } from "@/lib/siteUrl";

type RouteContext = { params: Promise<{ scheduleId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { scheduleId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      body?: unknown;
      candidateMessage?: unknown;
      expectedVersion?: unknown;
      subject?: unknown;
      workspaceId?: string;
    };
    return NextResponse.json(
      await queueMeetingInvitation({
        baseUrl: getPublicSiteUrlFromRequest(req),
        body: body.body,
        candidateMessage: body.candidateMessage,
        expectedVersion: body.expectedVersion,
        scheduleId,
        subject: body.subject,
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
    console.error("[org/meeting-schedules/send]", error);
    return NextResponse.json(
      {
        error:
          "일정 요청 전달을 시작하지 못했어요. 후보자에게 메일이 전달됐는지 확인한 뒤 다시 시도해 주세요.",
      },
      { status: 500 }
    );
  }
}
