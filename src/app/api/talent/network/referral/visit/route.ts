import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

type VisitReferralBody = {
  pagePath?: string;
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

  const token = String(body.token ?? "").trim();
  const visitorLocalId = String(body.visitorLocalId ?? "").trim() || null;
  const pagePath = String(body.pagePath ?? "").trim() || "/network";

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("talent_network_referral_links")
    .select(
      "first_visited_at, first_visitor_local_id, last_visitor_local_id, sharer_email, sharer_local_id, sharer_name, source, visit_count"
    )
    .eq("token", token)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Referral not found" }, { status: 404 });
  }

  if (
    data.sharer_local_id &&
    visitorLocalId &&
    data.sharer_local_id === visitorLocalId
  ) {
    return NextResponse.json(
      {
        ok: true,
        isSelfVisit: true,
        sharerEmail: data.sharer_email,
        sharerName: data.sharer_name,
        source: data.source,
      },
      { status: 200 }
    );
  }

  const now = new Date().toISOString();
  const nextVisitCount = (data.visit_count ?? 0) + 1;

  const { error: updateError } = await supabaseAdmin
    .from("talent_network_referral_links")
    .update({
      first_visited_at: data.first_visited_at ?? now,
      first_visitor_local_id: data.first_visitor_local_id ?? visitorLocalId,
      last_visited_at: now,
      last_visited_path: pagePath,
      last_visitor_local_id: visitorLocalId ?? data.last_visitor_local_id,
      updated_at: now,
      visit_count: nextVisitCount,
    })
    .eq("token", token);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      ok: true,
      isSelfVisit: false,
      sharerEmail: data.sharer_email,
      sharerName: data.sharer_name,
      source: data.source,
    },
    { status: 200 }
  );
}
