import { type NextRequest, NextResponse } from "next/server";
import {
  ComposioApiError,
  getIntegrationErrorDiagnostics,
} from "@/lib/integrations/composio";
import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import { syncGoogleCalendarBusyBlocks } from "@/lib/meetings/calendarSyncServer";
import { OrgHttpError } from "@/lib/org/server";
import { getFreshRequestUser } from "@/lib/supabaseServer";

function errorResponse(error: unknown) {
  console.error("[meeting-availability/calendar-sync]", {
    ...getIntegrationErrorDiagnostics(error),
    ...(error instanceof GoogleCalendarError ? { code: error.code } : {}),
  });
  if (error instanceof OrgHttpError || error instanceof GoogleCalendarError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  if (error instanceof ComposioApiError) {
    return NextResponse.json(
      {
        error:
          error.status === 401 || error.status === 403
            ? "Calendar Sync 설정을 확인해야 해요. Harper 팀에 문의해 주세요."
            : "Google Calendar 일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: error.status === 504 ? 504 : 503 }
    );
  }
  return NextResponse.json(
    { error: "Google Calendar 일정을 저장하지 못했어요." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getFreshRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      timezone?: unknown;
      workspaceId?: unknown;
    };
    return NextResponse.json(
      await syncGoogleCalendarBusyBlocks({
        timezone: typeof body.timezone === "string" ? body.timezone : "",
        user,
        workspaceId:
          typeof body.workspaceId === "string" ? body.workspaceId : "",
      }),
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
