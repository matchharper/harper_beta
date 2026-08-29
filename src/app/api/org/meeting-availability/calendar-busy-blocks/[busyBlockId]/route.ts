import { type NextRequest, NextResponse } from "next/server";
import { OrgHttpError } from "@/lib/org/server";
import { updateMeetingCalendarBusyBlock } from "@/lib/meetings/availabilityServer";
import { requireAuthenticatedUser } from "@/lib/server/candidateAccess";

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
  console.error("[meeting-availability/calendar-busy-block]", error);
  return NextResponse.json(
    { error: "Google Calendar 일정을 바꾸지 못했어요." },
    { status: 500 }
  );
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ busyBlockId: string }> }
) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      isBlocking?: unknown;
      workspaceId?: unknown;
    };
    if (typeof body.isBlocking !== "boolean") {
      return NextResponse.json(
        { error: "미팅 가능 여부를 확인해 주세요." },
        { status: 400 }
      );
    }
    const { busyBlockId } = await context.params;
    const busyBlock = await updateMeetingCalendarBusyBlock({
      busyBlockId,
      isBlocking: body.isBlocking,
      user,
      workspaceId: typeof body.workspaceId === "string" ? body.workspaceId : "",
    });
    return NextResponse.json({ busyBlock, ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
