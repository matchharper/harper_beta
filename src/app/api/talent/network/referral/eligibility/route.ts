import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  fetchTalentSetting,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { canShowReferralEntryPoints } from "@/lib/referralEligibility";

export const runtime = "nodejs";

type TalentReferralEligibilityProfile = {
  current_location?: string | null;
  location?: string | null;
};

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getTalentSupabaseAdmin();
    const [setting, profileResult] = await Promise.all([
      fetchTalentSetting({ admin, userId: user.id }),
      admin
        .from("talent_users")
        .select("location, current_location")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      throw new Error(
        profileResult.error.message ?? "Failed to load talent profile"
      );
    }

    const profile =
      (profileResult.data as TalentReferralEligibilityProfile | null) ?? null;
    const preferredLocale =
      setting?.setting_locale ?? setting?.preferred_locale ?? null;
    const location = profile?.location ?? null;
    const currentLocation = profile?.current_location ?? null;

    return NextResponse.json({
      ok: true,
      eligible: canShowReferralEntryPoints({
        location,
        currentLocation,
        preferredLocale,
      }),
      location,
      currentLocation,
      preferredLocale,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load referral eligibility";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
