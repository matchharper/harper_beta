import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { getTalentNetworkReferralList } from "@/lib/talentNetworkReferralServer";

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

  const url = new URL(req.url);
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const offset = normalizeOffset(url.searchParams.get("offset"));

  try {
    const result = await getTalentNetworkReferralList({
      admin: getTalentSupabaseAdmin(),
      limit,
      offset,
      referrerUserId: user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load referrals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
