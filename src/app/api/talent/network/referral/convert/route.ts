import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

type ConvertReferralBody = {
  referredEmail?: string;
  referredLocalId?: string;
  referredName?: string;
  selectedRole?: string;
  token?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  let body: ConvertReferralBody;
  try {
    body = (await req.json()) as ConvertReferralBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const referredEmail = String(body.referredEmail ?? "")
    .trim()
    .toLowerCase();
  const referredName = String(body.referredName ?? "").trim() || null;
  const referredLocalId = String(body.referredLocalId ?? "").trim() || null;
  const selectedRole = String(body.selectedRole ?? "").trim() || null;

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  if (!referredEmail || !isValidEmail(referredEmail)) {
    return NextResponse.json(
      { error: "Valid referred email is required" },
      { status: 400 }
    );
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("talent_network_referral_links")
    .select("conversion_count, first_converted_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("talent_network_referral_links")
    .update({
      conversion_count: (data.conversion_count ?? 0) + 1,
      first_converted_at: data.first_converted_at ?? now,
      last_converted_at: now,
      last_converted_email: referredEmail,
      last_converted_local_id: referredLocalId,
      last_converted_name: referredName,
      last_converted_role: selectedRole,
      updated_at: now,
    })
    .eq("token", token);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
