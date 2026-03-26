import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  getCompanyUserSummary,
  getLatestTossPaymentForUser,
  getPlanByKeyAndBilling,
  getTossCustomerKeyForUser,
} from "@/lib/billing/server";
import {
  getActiveSubscriptionOrFilter,
  type BillingPeriod,
  type BillingPlanKey,
  type BillingSessionReason,
} from "@/lib/billing/common";
import { getTossClientKey } from "@/lib/toss/server";

export const runtime = "nodejs";

const SESSION_TTL_MS = 30 * 60 * 1000;

type PrepareBody = {
  userId?: string;
  planKey?: BillingPlanKey;
  billing?: BillingPeriod;
  reason?: BillingSessionReason;
};

export async function POST(req: Request) {
  const clientKey = getTossClientKey();
  if (!clientKey) {
    return NextResponse.json(
      { error: "Missing Toss client key" },
      { status: 500 }
    );
  }

  let body: PrepareBody;
  try {
    body = (await req.json()) as PrepareBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(body?.userId ?? "").trim();
  const planKey = String(body?.planKey ?? "").trim() as BillingPlanKey;
  const billing = String(body?.billing ?? "").trim() as BillingPeriod;
  const reason = String(body?.reason ?? "signup").trim() as BillingSessionReason;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if ((planKey !== "pro" && planKey !== "max") || (billing !== "monthly" && billing !== "yearly")) {
    return NextResponse.json(
      { error: "Invalid planKey or billing" },
      { status: 400 }
    );
  }

  if (reason !== "signup" && reason !== "recover") {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const companyUser = await getCompanyUserSummary(supabaseAdmin, userId);
  if (!companyUser?.user_id || !companyUser.is_authenticated) {
    return NextResponse.json({ error: "Unauthorized user" }, { status: 403 });
  }

  const plan = await getPlanByKeyAndBilling(supabaseAdmin, planKey, billing);
  if (!plan || !Number.isFinite(plan.price_krw ?? NaN)) {
    return NextResponse.json(
      { error: "Billing plan is not configured" },
      { status: 400 }
    );
  }

  let paymentId: number | null = null;
  if (reason === "signup") {
    const nowIso = new Date().toISOString();
    const { data: activePaymentData, error } = await supabaseAdmin
      .from("payments")
      .select("id, provider, provider_status")
      .eq("user_id", userId)
      .or(getActiveSubscriptionOrFilter(nowIso))
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to verify active subscription" },
        { status: 500 }
      );
    }

    const activePayment = (activePaymentData as unknown) as {
      id: number;
      provider: string | null;
      provider_status: string | null;
    } | null;

    if (activePayment?.id) {
      return NextResponse.json(
        {
          error: "Active subscription already exists",
          provider: activePayment.provider,
          providerStatus: activePayment.provider_status,
        },
        { status: 409 }
      );
    }
  } else {
    const latestTossPayment = await getLatestTossPaymentForUser(
      supabaseAdmin,
      userId
    );

    if (!latestTossPayment?.id || latestTossPayment.provider_status !== "past_due") {
      return NextResponse.json(
        { error: "No recoverable Toss subscription" },
        { status: 409 }
      );
    }

    if (latestTossPayment.plan_id !== plan.plan_id) {
      return NextResponse.json(
        { error: "Recover plan does not match the overdue subscription" },
        { status: 409 }
      );
    }

    paymentId = latestTossPayment.id;
  }

  const sessionToken = crypto.randomUUID();
  const origin = new URL(req.url).origin;
  const successUrl = `${origin}/my/billing?billing_auth=success&session_token=${encodeURIComponent(sessionToken)}`;
  const failUrl = `${origin}/my/billing?billing_auth=fail&session_token=${encodeURIComponent(sessionToken)}`;
  const customerKey = getTossCustomerKeyForUser(userId);

  const { error: insertError } = await supabaseAdmin.from("billing_sessions").insert({
    session_token: sessionToken,
    user_id: userId,
    payment_id: paymentId,
    plan_id: plan.plan_id,
    plan_key: planKey,
    billing,
    amount_krw: Number(plan.price_krw ?? 0),
    reason,
    status: "pending",
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to create billing session" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      sessionToken,
      amount: Number(plan.price_krw ?? 0),
      billing,
      planId: plan.plan_id,
      planKey,
      planName: plan.display_name ?? plan.name ?? planKey,
      customerKey,
      clientKey,
      successUrl,
      failUrl,
      reason,
    },
    { status: 200 }
  );
}
