import { type NextRequest, NextResponse } from "next/server";
import { getIntegrationErrorDiagnostics } from "@/lib/integrations/composio";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { retryMeetingCalendarEvent } from "@/lib/meetings/meetingCalendarServer";
import { OrgHttpError } from "@/lib/org/server";
import { getFreshRequestUser } from "@/lib/supabaseServer";

type RouteContext = { params: Promise<{ scheduleId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { scheduleId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: unknown;
    };
    return NextResponse.json(
      await retryMeetingCalendarEvent({
        scheduleId,
        user,
        workspaceId:
          typeof body.workspaceId === "string" ? body.workspaceId : "",
      }),
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    if (error instanceof OrgHttpError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    console.error("[meeting-schedule/calendar-retry]", {
      ...getIntegrationErrorDiagnostics(error),
      ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
    });
    return NextResponse.json(
      { error: "Calendar 초대와 Google Meet 링크를 다시 만들지 못했어요." },
      { status: 500 }
    );
  }
}
