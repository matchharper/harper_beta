import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { isInternalEmail } from "@/lib/internalAccess";
import { markTalentNetworkReferralPaid } from "@/lib/talentNetworkReferralServer";

export const runtime = "nodejs";

type MarkReferralPaidBody = {
  paidAt?: string;
  referredUserId?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user || !isInternalEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MarkReferralPaidBody;
  try {
    body = (await req.json()) as MarkReferralPaidBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const referredUserId = String(body.referredUserId ?? "").trim();
  if (!referredUserId) {
    return NextResponse.json(
      { error: "referredUserId is required" },
      { status: 400 }
    );
  }

  try {
    const result = await markTalentNetworkReferralPaid({
      admin: getTalentSupabaseAdmin(),
      paidAt: String(body.paidAt ?? "").trim() || null,
      referredUserId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark referral paid";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
