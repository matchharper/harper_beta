import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  buildReferralUrl,
  getRequestBaseUrl,
  getTalentNetworkReferralSummary,
} from "@/lib/talentNetworkReferralServer";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getTalentNetworkReferralSummary({
      admin: getTalentSupabaseAdmin(),
      referrerUserId: user.id,
    });

    return NextResponse.json({
      ok: true,
      createdAt: summary.createdAt,
      stats: summary.stats,
      token: summary.token,
      url: buildReferralUrl({
        baseUrl: getRequestBaseUrl(req),
        token: summary.token,
      }),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load referral";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

