import { NextRequest, NextResponse } from "next/server";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { getTalentNetworkReferralRewardList } from "@/lib/talentNetworkReferralServer";
import { getRequestUser } from "@/lib/supabaseServer";

export const runtime = "nodejs";

function normalizeLimit(value: string | null) {
  const limit = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(limit)) return 10;
  return Math.min(10, Math.max(1, limit));
}

function normalizeOffset(value: string | null) {
  const offset = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, offset);
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await getTalentNetworkReferralRewardList({
      admin: getTalentSupabaseAdmin(),
      limit: normalizeLimit(req.nextUrl.searchParams.get("limit")),
      offset: normalizeOffset(req.nextUrl.searchParams.get("offset")),
      referrerUserId: user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load referral applications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
