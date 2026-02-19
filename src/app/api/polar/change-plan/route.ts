import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Polar } from "@polar-sh/sdk";
import {
  POLAR_PRODUCT_PROFILE,
  POLAR_SERVER,
  getPolarProductId,
} from "@/lib/polar/config";

export const runtime = "nodejs";

type PlanKey = "pro" | "max";
type Billing = "monthly" | "yearly";

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
  let planKey = "" as PlanKey | "";
  let billing = "" as Billing | "";
  try {
    const body = await req.json();
    userId = String(body?.userId ?? "");
    planKey = String(body?.planKey ?? "") as PlanKey | "";
    billing = String(body?.billing ?? "") as Billing | "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if (
    (planKey !== "pro" && planKey !== "max") ||
    (billing !== "monthly" && billing !== "yearly")
  ) {
    return NextResponse.json(
      { error: "Invalid planKey or billing" },
      { status: 400 }
    );
  }

  const targetProductId = getPolarProductId(planKey, billing);
  if (!targetProductId) {
    return NextResponse.json(
      {
        error: "Polar product is not configured for this plan/billing",
        planKey,
        billing,
        profile: POLAR_PRODUCT_PROFILE,
      },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const { data: activePayment, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("ls_subscription_id, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .gte("current_period_end", nowIso)
    .not("ls_subscription_id", "is", null)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    return NextResponse.json(
      { error: "Failed to load active subscription" },
      { status: 500 }
    );
  }

  if (!activePayment?.ls_subscription_id) {
    return NextResponse.json(
      { error: "No active subscription to update" },
      { status: 404 }
    );
  }

  if (activePayment.cancel_at_period_end) {
    return NextResponse.json(
      {
        error:
          "Subscription is scheduled to cancel at period end. Please contact support for immediate plan change.",
      },
      { status: 409 }
    );
  }

  const subscriptionId = activePayment.ls_subscription_id;

  try {
    const current = await polarClient.subscriptions.get({ id: subscriptionId });
    if (current.productId === targetProductId) {
      return NextResponse.json(
        {
          status: "no_change",
          data: {
            id: current.id,
            productId: current.productId,
            currentPeriodEnd: toIsoString(current.currentPeriodEnd),
          },
        },
        { status: 200 }
      );
    }

    const updated = await polarClient.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        productId: targetProductId,
        prorationBehavior: "invoice",
      },
    });

    return NextResponse.json(
      {
        status: "plan_change_requested",
        data: {
          id: updated.id,
          productId: updated.productId,
          currentPeriodEnd: toIsoString(updated.currentPeriodEnd),
          prorationBehavior: "invoice",
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const err = e as {
      message?: string;
      statusCode?: number;
      body?: string;
    };
    const statusCode =
      typeof err?.statusCode === "number" && err.statusCode >= 400
        ? err.statusCode
        : 502;

    return NextResponse.json(
      {
        error: "Failed to update Polar subscription",
        message: err?.body || err?.message || "Unknown error",
        polarServer: POLAR_SERVER,
        targetProductId,
      },
      { status: statusCode }
    );
  }
}
