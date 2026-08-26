import { type NextRequest, NextResponse } from "next/server";
import {
  fetchPublicMeetingInvitation,
  MeetingInvitationHttpError,
  submitPublicMeetingOptions,
} from "@/lib/meetings/invitationServer";

type RouteContext = { params: Promise<{ token: string }> };

function errorResponse(error: unknown) {
  if (error instanceof MeetingInvitationHttpError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  console.error("[meeting/public-invitation]", error);
  return NextResponse.json(
    {
      error: "일정 선택 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    },
    { status: 500 }
  );
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    return NextResponse.json(await fetchPublicMeetingInvitation(token), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      slotIds?: unknown;
    };
    return NextResponse.json(
      await submitPublicMeetingOptions({ slotIds: body.slotIds, token }),
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
