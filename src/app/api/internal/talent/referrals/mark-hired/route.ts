import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { isInternalEmail } from "@/lib/internalAccess";
import { markTalentNetworkReferralHired } from "@/lib/talentNetworkReferralServer";

export const runtime = "nodejs";

type MarkReferralHiredBody = {
  hiredAt?: string;
  referredUserId?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user || !isInternalEmail(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: MarkReferralHiredBody;
  try {
    body = (await req.json()) as MarkReferralHiredBody;
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
    const result = await markTalentNetworkReferralHired({
      admin: getTalentSupabaseAdmin(),
      hiredAt: String(body.hiredAt ?? "").trim() || null,
      referredUserId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to mark referral hired";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

