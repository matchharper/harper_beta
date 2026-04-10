import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const { error } = await admin
      .from("talent_notification")
      .update({ is_read: true })
      .eq("talent_id", user.id)
      .or("is_read.is.null,is_read.eq.false");

    if (error) {
      return NextResponse.json(
        { error: error.message ?? "Failed to update notifications" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
