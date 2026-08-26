import { type NextRequest, NextResponse } from "next/server";
import {
  fetchMeetingScheduleDetail,
  updateMeetingScheduleDraft,
} from "@/lib/meetings/scheduleDraftServer";
import { OrgHttpError } from "@/lib/org/server";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

type RouteContext = {
  params: Promise<{ scheduleId: string }>;
};

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
  console.error("[org/meeting-schedules/detail]", error);
  return NextResponse.json(
    { error: "일정 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요." },
    { status: 500 }
  );
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { scheduleId } = await context.params;
    const payload = await fetchMeetingScheduleDetail({
      scheduleId,
      user,
      workspaceId: req.nextUrl.searchParams.get("workspaceId") ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { scheduleId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      additionalMessage?: unknown;
      additionalMessageVisibility?: unknown;
      attendeeEmails?: string[];
      durationMinutes?: unknown;
      expectedVersion?: unknown;
      title?: unknown;
      workspaceId?: string;
    };
    const payload = await updateMeetingScheduleDraft({
      additionalMessage: body.additionalMessage,
      additionalMessageVisibility: body.additionalMessageVisibility,
      attendeeEmails: Array.isArray(body.attendeeEmails)
        ? body.attendeeEmails
        : [],
      durationMinutes: body.durationMinutes,
      expectedVersion: body.expectedVersion,
      scheduleId,
      title: body.title,
      user,
      workspaceId: body.workspaceId ?? "",
    });
    return NextResponse.json(payload);
  } catch (error) {
    return toErrorResponse(error);
  }
}
