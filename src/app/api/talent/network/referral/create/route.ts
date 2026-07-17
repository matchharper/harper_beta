import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  buildReferralUrl,
  getOrCreateTalentNetworkReferralLink,
  getRequestBaseUrl,
} from "@/lib/talentNetworkReferralServer";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getTalentSupabaseAdmin();
    const link = await getOrCreateTalentNetworkReferralLink({
      admin,
      referrerUserId: user.id,
    });
    const url = buildReferralUrl({
      baseUrl: getRequestBaseUrl(req),
      token: link.token,
    });

    return NextResponse.json({
      ok: true,
      token: link.token,
      url,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create referral link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
