import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const LS_API_KEY =
  process.env.LEMON_SQUEEZY_API_KEY ||
  process.env.LEMONSQUEEZY_API_KEY ||
  "";

export async function POST(req: Request) {
  if (!LS_API_KEY) {
    return NextResponse.json(
      { error: "Missing Lemon Squeezy API key" },
      { status: 500 }
    );
  }

  let userId = "";
  try {
    const body = await req.json();
    userId = String(body?.userId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select("ls_subscription_id, current_period_end")
    .eq("user_id", userId)
    .gte("current_period_end", nowIso)
    .not("ls_subscription_id", "is", null)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  if (!payment?.ls_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription" },
      { status: 404 }
    );
  }

  const res = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${payment.ls_subscription_id}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${LS_API_KEY}`,
      },
    }
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: res.status }
    );
  }

  const data = await res.json();
  return NextResponse.json({ status: "cancel_requested", data }, { status: 200 });
}
