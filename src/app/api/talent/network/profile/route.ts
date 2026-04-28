import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import {
  normalizeTalentNetworkApplication,
  type TalentNetworkApplication,
} from "@/lib/talentNetworkApplication";

type Body = {
  networkApplication?: TalentNetworkApplication;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const networkApplication = normalizeTalentNetworkApplication(
      body?.networkApplication
    );

    if (!networkApplication) {
      return NextResponse.json(
        { error: "networkApplication is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const { data: updatedProfile, error: updateError } = await admin
      .from("talent_users")
      .update({
        career_profile: networkApplication,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("updated_at")
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          error: updateError.message ?? "Failed to update network application",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      networkApplication,
      ok: true,
      updatedAt: updatedProfile?.updated_at ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update network application";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
