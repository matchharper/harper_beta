import { NextResponse } from "next/server";
import {
  addBillingPeriod,
  buildOrderId,
  cycleToBilling,
  getActiveSubscriptionOrFilter,
  type BillingPeriod,
  type BillingPlanKey,
} from "@/lib/billing/common";
import {
  createProcessingAttempt,
  createSupabaseAdminClient,
  getCompanyUserSummary,
  getExistingAttemptConflictCode,
  getPlanByKeyAndBilling,
  getPaymentAttemptByAttemptKey,
  resetCreditsForPlan,
  updatePaymentAttempt,
} from "@/lib/billing/server";
import { notifyBillingPaymentSucceeded } from "@/lib/billing/notifications";
import { approveBilling, TossRequestError } from "@/lib/toss/server";

export const runtime = "nodejs";

type ChangePlanBody = {
  userId?: string;
  planKey?: BillingPlanKey;
  billing?: BillingPeriod;
};

function getPlanOrderName(planName: string) {
  return `Harper ${planName} 구독 변경`.slice(0, 100);
}

export async function POST(req: Request) {
  let body: ChangePlanBody;
  try {
    body = (await req.json()) as ChangePlanBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = String(body?.userId ?? "").trim();
  const planKey = String(body?.planKey ?? "").trim() as BillingPlanKey;
  const billing = String(body?.billing ?? "").trim() as BillingPeriod;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  if ((planKey !== "pro" && planKey !== "max") || (billing !== "monthly" && billing !== "yearly")) {
    return NextResponse.json(
      { error: "Invalid planKey or billing" },
      { status: 400 }
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data: paymentData, error: paymentError } = await supabaseAdmin
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "toss")
    .or(getActiveSubscriptionOrFilter(nowIso))
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (paymentError) {
    return NextResponse.json(
      { error: "Failed to load active Toss subscription" },
      { status: 500 }
    );
  }

  const payment = (paymentData as unknown) as {
    id: number;
    plan_id: string | null;
    provider_status: string | null;
    cancel_at_period_end: boolean | null;
    toss_billing_key: string | null;
    toss_customer_key: string | null;
    current_period_end: string | null;
    updated_at: string | null;
    card_number_masked: string | null;
  } | null;

  if (!payment?.id || !payment.toss_billing_key) {
    return NextResponse.json(
      { error: "No active Toss subscription to update" },
      { status: 404 }
    );
  }

  if (payment.provider_status !== "active") {
    return NextResponse.json(
      { error: "Only active Toss subscriptions can change plans" },
      { status: 409 }
    );
  }

  if (payment.cancel_at_period_end) {
    return NextResponse.json(
      { error: "Canceled subscriptions cannot change plans" },
      { status: 409 }
    );
  }

  const plan = await getPlanByKeyAndBilling(supabaseAdmin, planKey, billing);
  if (!plan || !Number.isFinite(plan.price_krw ?? NaN)) {
    return NextResponse.json(
      { error: "Target plan is not configured" },
      { status: 400 }
    );
  }

  if (payment.plan_id === plan.plan_id) {
    return NextResponse.json(
      {
        status: "no_change",
        paymentId: payment.id,
        currentPeriodEnd: payment.current_period_end,
      },
      { status: 200 }
    );
  }

  const changeAnchor = new Date(
    payment.current_period_end ?? payment.updated_at ?? nowIso
  ).getTime();
  const attemptKey = `plan_change:${payment.id}:${payment.plan_id}:${plan.plan_id}:${changeAnchor}`;
  const orderId = buildOrderId(
    "change",
    `${payment.id}_${plan.plan_id}_${changeAnchor}`
  );

  let attempt;
  try {
    attempt = await createProcessingAttempt({
      supabaseAdmin,
      paymentId: payment.id,
      userId,
      provider: "toss",
      attemptKey,
      reason: "plan_change",
      planId: plan.plan_id,
      amountKRW: Number(plan.price_krw ?? 0),
      orderId,
    });
  } catch (error) {
    if (!getExistingAttemptConflictCode(error as { code?: string })) {
      throw error;
    }

    const existingAttempt = await getPaymentAttemptByAttemptKey(
      supabaseAdmin,
      attemptKey
    );
    if (existingAttempt?.status === "success") {
      return NextResponse.json(
        {
          status: "already_changed",
          paymentId: payment.id,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Plan change is already in progress" },
      { status: 409 }
    );
  }

  if (!attempt?.id) {
    return NextResponse.json(
      { error: "Failed to create plan change attempt" },
      { status: 500 }
    );
  }

  try {
    const companyUser = await getCompanyUserSummary(supabaseAdmin, userId);
    const approvedPayment = await approveBilling({
      billingKey: payment.toss_billing_key,
      amount: Number(plan.price_krw ?? 0),
      customerKey: payment.toss_customer_key ?? userId,
      orderId,
      orderName: getPlanOrderName(plan.display_name ?? plan.name ?? planKey),
      customerEmail: companyUser?.email ?? undefined,
      customerName: companyUser?.name ?? undefined,
    });

    const nextBilling = cycleToBilling(plan.cycle);
    if (!nextBilling) {
      throw new Error("Unsupported target billing cycle");
    }

    const startAt = new Date(approvedPayment.approvedAt ?? nowIso);
    const currentPeriodStart = startAt.toISOString();
    const currentPeriodEnd = addBillingPeriod(startAt, nextBilling).toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("payments")
      .update({
        plan_id: plan.plan_id,
        provider_status: "active",
        cancel_at_period_end: false,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        next_charge_at: currentPeriodEnd,
        retry_next_at: null,
        retry_count: null,
        grace_ends_at: null,
        cancelled_at: null,
        toss_last_payment_key: approvedPayment.paymentKey,
        toss_last_order_id: approvedPayment.orderId,
        card_number_masked:
          approvedPayment.card?.number ?? payment.card_number_masked ?? null,
        updated_at: nowIso,
      })
      .eq("id", payment.id);

    if (updateError) throw updateError;

    await updatePaymentAttempt(supabaseAdmin, attempt.id, {
      status: "success",
      payment_id: payment.id,
      payment_key: approvedPayment.paymentKey,
      approved_at: approvedPayment.approvedAt ?? nowIso,
      receipt_url: approvedPayment.receipt?.url ?? null,
      raw_response: approvedPayment as never,
    });

    await resetCreditsForPlan({
      supabaseAdmin,
      userId,
      plan,
      eventType: `${plan.name ?? planKey}_subscription_plan_change`,
    });

    try {
      await notifyBillingPaymentSucceeded({
        kind: "subscription_plan_change",
        userId,
        userEmail: companyUser?.email ?? null,
        userName: companyUser?.name ?? null,
        planName: plan.display_name ?? plan.name ?? planKey,
        billing: nextBilling,
        amountKRW: Number(plan.price_krw ?? 0),
        approvedAt: approvedPayment.approvedAt ?? nowIso,
        orderId,
        paymentKey: approvedPayment.paymentKey,
      });
    } catch (slackError) {
      console.error("[billing] slack notify failed after plan change", {
        paymentId: payment.id,
        error: slackError,
      });
    }

    return NextResponse.json(
      {
        status: "changed",
        paymentId: payment.id,
        currentPeriodEnd,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof TossRequestError ? error.message : "Failed to change plan";
    const code = error instanceof TossRequestError ? error.code : null;
    const responseBody =
      error instanceof TossRequestError ? error.responseBody : null;
    const status =
      error instanceof TossRequestError && error.status >= 400
        ? error.status
        : 502;

    await updatePaymentAttempt(supabaseAdmin, attempt.id, {
      status: "failed",
      failure_code: code,
      failure_message: message,
      raw_response: responseBody as never,
    });

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status }
    );
  }
}
