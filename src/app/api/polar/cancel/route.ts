import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Polar } from "@polar-sh/sdk";
import { POLAR_SERVER } from "@/lib/polar/config";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const POLAR_API_KEY =
  process.env.POLAR_API_KEY || process.env.POLAR_ACCESS_TOKEN || "";

const polarClient = POLAR_API_KEY
  ? new Polar({
      accessToken: POLAR_API_KEY,
      server: POLAR_SERVER,
    })
  : null;

function toIsoString(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v.toISOString();
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(req: Request) {
  if (!polarClient) {
    return NextResponse.json(
      { error: "Missing Polar API key" },
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

  try {
    const updated = await polarClient.subscriptions.update({
      id: payment.ls_subscription_id,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    return NextResponse.json(
      {
        status: "cancel_requested",
        data: {
          id: updated.id,
          cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
          currentPeriodEnd: toIsoString(updated.currentPeriodEnd),
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    return NextResponse.json(
      {
        error: "Failed to cancel subscription",
        message: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 502 }
    );
  }
}
