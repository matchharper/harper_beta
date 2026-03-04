import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    return NextResponse.json({
      ok: true,
      userId: user.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to bootstrap talent user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
