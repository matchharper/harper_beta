import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  normalizeReferralToken,
  recordTalentNetworkReferralVisit,
} from "@/lib/talentNetworkReferralServer";
import {
  buildTalentNetworkReferralVisitLogType,
  TALENT_NETWORK_REFERRAL_VISIT_ABTEST_TYPE,
} from "@/lib/talentNetworkReferralTracking";

export const runtime = "nodejs";

type VisitReferralBody = {
  token?: string;
  visitorLocalId?: string;
};

export async function POST(req: NextRequest) {
  let body: VisitReferralBody;
  try {
    body = (await req.json()) as VisitReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = normalizeReferralToken(body.token);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }
  const visitorLocalId = String(body.visitorLocalId ?? "")
    .trim()
    .slice(0, 120);

  try {
    const user = await getRequestUser(req);
    const admin = getTalentSupabaseAdmin();
    const result = await recordTalentNetworkReferralVisit({
      admin,
      token,
      visitorUserId: user?.id ?? null,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Referral not found" },
        { status: 404 }
      );
    }

    if (!result.isSelfVisit && visitorLocalId) {
      const { error: visitLogError } = await admin.from("landing_logs").insert({
        abtest_type: TALENT_NETWORK_REFERRAL_VISIT_ABTEST_TYPE,
        country_lang: null,
        is_mobile: null,
        local_id: visitorLocalId,
        type: buildTalentNetworkReferralVisitLogType(token),
      });
      if (visitLogError) {
        console.error(
          "[talent/network/referral/visit] visit log insert failed:",
          visitLogError.message
        );
      }
    }

    return NextResponse.json({
      isSelfVisit: result.isSelfVisit,
      ok: true,
      token: result.token,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record referral";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
