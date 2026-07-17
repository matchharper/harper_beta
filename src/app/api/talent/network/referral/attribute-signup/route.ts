import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  attributeTalentNetworkReferralSignup,
  normalizeReferralToken,
} from "@/lib/talentNetworkReferralServer";

export const runtime = "nodejs";

type AttributeReferralBody = {
  token?: string;
};

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AttributeReferralBody;
  try {
    body = (await req.json()) as AttributeReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = normalizeReferralToken(body.token);
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  try {
    const result = await attributeTalentNetworkReferralSignup({
      admin: getTalentSupabaseAdmin(),
      referredUser: user,
      token,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to attribute referral signup";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

