import { NextRequest, NextResponse } from "next/server";
import { rollbackCareerCoachingCallStart } from "@/lib/career/careerCoachingActivity";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const activityMessageId = Number(body.activityMessageId);
    const expectedRevision = Number(body.expectedRevision);
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    if (
      !conversationId ||
      !Number.isSafeInteger(activityMessageId) ||
      activityMessageId < 1 ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 1
    ) {
      return NextResponse.json(
        { error: "Invalid career coaching call rollback request" },
        { status: 400 }
      );
    }

    const activityMessage = await rollbackCareerCoachingCallStart({
      activityMessageId,
      admin: getTalentSupabaseAdmin(),
      conversationId,
      expectedRevision,
      userId: user.id,
    });
    return NextResponse.json({ activityMessage, ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to roll back career coaching call start";
    return NextResponse.json(
      { error: message },
      { status: /revision conflict/i.test(message) ? 409 : 500 }
    );
  }
}
