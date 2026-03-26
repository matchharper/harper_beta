import { NextResponse } from "next/server";
import {
  addBillingPeriod,
  buildOrderId,
  cycleToBilling,
  getGraceEndsAt,
  getRetryNextAt,
} from "@/lib/billing/common";
import {
  createProcessingAttempt,
  createSupabaseAdminClient,
  getCompanyUserSummary,
  getExistingAttemptConflictCode,
  getPaymentAttemptByAttemptKey,
  resetCreditsForPlan,
  updatePaymentAttempt,
} from "@/lib/billing/server";
import { approveBilling, deleteBillingKey, TossRequestError } from "@/lib/toss/server";

export const runtime = "nodejs";

function getConfiguredCronSecrets() {
  return [
    process.env.CRON_SECRET?.trim(),
    process.env.BILLING_CRON_SECRET?.trim(),
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: Request) {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  if (!token) return false;

  const configuredSecrets = getConfiguredCronSecrets();
  return configuredSecrets.includes(token);
}

function getOrderName(planName: string) {
  return `Harper ${planName} 정기결제`.slice(0, 100);
}

async function expireCanceledSubscription(args: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  paymentId: number;
  billingKey?: string | null;
  nowIso: string;
}) {
  if (args.billingKey) {
    try {
      await deleteBillingKey(args.billingKey);
    } catch {
      // Ignore cleanup failures at expiration time.
    }
  }

  const { error } = await args.supabaseAdmin
    .from("payments")
    .update({
      provider_status: "expired",
      next_charge_at: null,
      retry_next_at: null,
      retry_count: null,
      grace_ends_at: null,
      updated_at: args.nowIso,
    })
    .eq("id", args.paymentId);

  if (error) throw error;
}

async function handleSweep(req: Request) {
  const configuredSecrets = getConfiguredCronSecrets();
  if (configuredSecrets.length === 0) {
    return NextResponse.json(
      { error: "Missing CRON_SECRET or BILLING_CRON_SECRET" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  const summary = {
    expired: 0,
    charged: 0,
    failed: 0,
    skipped: 0,
  };

  console.info("[billing-sweep] started", {
    nowIso,
    method: req.method,
    userAgent,
  });

  const { data: cancelRowsData, error: cancelError } = await supabaseAdmin
    .from("payments")
    .select("id, toss_billing_key")
    .eq("provider", "toss")
    .eq("provider_status", "cancel_scheduled")
    .not("current_period_end", "is", null)
    .lte("current_period_end", nowIso);

  if (cancelError) {
    return NextResponse.json(
      { error: "Failed to load scheduled cancellations" },
      { status: 500 }
    );
  }

  const cancelRows = ((cancelRowsData ?? []) as unknown) as Array<{
    id: number;
    toss_billing_key: string | null;
  }>;

  for (const row of cancelRows ?? []) {
    await expireCanceledSubscription({
      supabaseAdmin,
      paymentId: row.id,
      billingKey: row.toss_billing_key,
      nowIso,
    });
    summary.expired += 1;
  }

  const { data: duePaymentsData, error: dueError } = await supabaseAdmin
    .from("payments")
    .select(
      `
        id,
        user_id,
        plan_id,
        provider_status,
        current_period_end,
        toss_billing_key,
        toss_customer_key,
        retry_count,
        retry_next_at,
        grace_ends_at,
        next_charge_at,
        card_number_masked,
        plans (
          plan_id,
          name,
          display_name,
          cycle,
          credit,
          price_krw
        )
      `
    )
    .eq("provider", "toss")
    .in("provider_status", ["active", "past_due"])
    .not("toss_billing_key", "is", null)
    .or(`next_charge_at.lte.${nowIso},retry_next_at.lte.${nowIso}`);

  if (dueError) {
    return NextResponse.json(
      { error: "Failed to load due Toss subscriptions" },
      { status: 500 }
    );
  }

  const duePayments = ((duePaymentsData ?? []) as unknown) as Array<{
    id: number;
    user_id: string;
    plan_id: string | null;
    provider_status: "active" | "past_due";
    current_period_end: string | null;
    toss_billing_key: string | null;
    toss_customer_key: string | null;
    retry_count: number | null;
    retry_next_at: string | null;
    grace_ends_at: string | null;
    next_charge_at: string | null;
    card_number_masked: string | null;
    plans: {
      plan_id: string;
      name: string | null;
      display_name: string | null;
      cycle: number | null;
      credit: number | null;
      price_krw: number | null;
    } | null;
  }>;

  for (const payment of duePayments ?? []) {
    const dueAnchorIso = payment.current_period_end ?? payment.next_charge_at ?? null;
    if (!payment.id || !payment.user_id || !payment.toss_billing_key || !dueAnchorIso) {
      summary.skipped += 1;
      continue;
    }

    const graceEndsAt = payment.grace_ends_at ? new Date(payment.grace_ends_at) : null;
    if (
      payment.provider_status === "past_due" &&
      graceEndsAt &&
      !Number.isNaN(graceEndsAt.getTime()) &&
      graceEndsAt < now
    ) {
      await supabaseAdmin
        .from("payments")
        .update({
          provider_status: "expired",
          next_charge_at: null,
          retry_next_at: null,
          updated_at: nowIso,
        })
        .eq("id", payment.id);
      summary.expired += 1;
      continue;
    }

    const plan = (payment as any)?.plans ?? null;
    const billing = cycleToBilling(plan?.cycle ?? null);
    if (!plan?.plan_id || !billing || !Number.isFinite(plan?.price_krw ?? NaN)) {
      summary.skipped += 1;
      continue;
    }

    const retryCount = Number(payment.retry_count ?? 0);
    const attemptReason = payment.provider_status === "past_due" ? "retry" : "renewal";
    const attemptStage = payment.provider_status === "past_due" ? retryCount : 0;
    const attemptKey = `${attemptReason}:${payment.id}:${dueAnchorIso}:${attemptStage}`;
    const orderId = buildOrderId(
      attemptReason === "retry" ? "retry" : "renew",
      `${payment.id}_${dueAnchorIso}_${attemptStage}`
    );

    let attempt;
    try {
      attempt = await createProcessingAttempt({
        supabaseAdmin,
        paymentId: payment.id,
        userId: payment.user_id,
        provider: "toss",
        attemptKey,
        reason: attemptReason,
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
      if (existingAttempt?.status === "processing") {
        summary.skipped += 1;
        continue;
      }
      if (existingAttempt?.status === "success") {
        summary.skipped += 1;
        continue;
      }
      summary.skipped += 1;
      continue;
    }

    if (!attempt?.id) {
      summary.skipped += 1;
      continue;
    }

    try {
      const companyUser = await getCompanyUserSummary(supabaseAdmin, payment.user_id);
      const approvedPayment = await approveBilling({
        billingKey: payment.toss_billing_key,
        amount: Number(plan.price_krw ?? 0),
        customerKey: payment.toss_customer_key ?? payment.user_id,
        orderId,
        orderName: getOrderName(plan.display_name ?? plan.name ?? "subscription"),
        customerEmail: companyUser?.email ?? undefined,
        customerName: companyUser?.name ?? undefined,
      });

      const dueAnchor = new Date(dueAnchorIso);
      const nextEnd = addBillingPeriod(dueAnchor, billing).toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("payments")
        .update({
          provider_status: "active",
          current_period_start: dueAnchor.toISOString(),
          current_period_end: nextEnd,
          next_charge_at: nextEnd,
          retry_next_at: null,
          retry_count: null,
          grace_ends_at: null,
          cancel_at_period_end: false,
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
        userId: payment.user_id,
        plan,
        eventType:
          attemptReason === "retry"
            ? `${plan.name ?? "subscription"}_subscription_retry`
            : `${plan.name ?? "subscription"}_subscription_renewal`,
      });

      summary.charged += 1;
    } catch (error) {
      const message =
        error instanceof TossRequestError ? error.message : "Recurring Toss billing failed";
      const code = error instanceof TossRequestError ? error.code : null;
      const responseBody =
        error instanceof TossRequestError ? error.responseBody : null;

      await updatePaymentAttempt(supabaseAdmin, attempt.id, {
        status: "failed",
        failure_code: code,
        failure_message: message,
        raw_response: responseBody as never,
      });

      const dueAnchor = new Date(dueAnchorIso);
      if (payment.provider_status === "active") {
        const graceEnds = getGraceEndsAt(dueAnchor).toISOString();
        const retryNextAt = getRetryNextAt(dueAnchor, 1)?.toISOString() ?? null;
        await supabaseAdmin
          .from("payments")
          .update({
            provider_status: "past_due",
            next_charge_at: null,
            retry_count: 1,
            retry_next_at: retryNextAt,
            grace_ends_at: graceEnds,
            updated_at: nowIso,
          })
          .eq("id", payment.id);
      } else if (retryCount >= 3) {
        await supabaseAdmin
          .from("payments")
          .update({
            provider_status: "expired",
            next_charge_at: null,
            retry_next_at: null,
            retry_count: null,
            grace_ends_at: null,
            updated_at: nowIso,
          })
          .eq("id", payment.id);
        summary.expired += 1;
      } else {
        const nextRetryCount = retryCount + 1;
        const retryNextAt =
          getRetryNextAt(dueAnchor, nextRetryCount)?.toISOString() ?? null;
        await supabaseAdmin
          .from("payments")
          .update({
            provider_status: "past_due",
            next_charge_at: null,
            retry_count: nextRetryCount,
            retry_next_at: retryNextAt,
            grace_ends_at:
              payment.grace_ends_at ?? getGraceEndsAt(dueAnchor).toISOString(),
            updated_at: nowIso,
          })
          .eq("id", payment.id);
      }

      summary.failed += 1;
    }
  }

  console.info("[billing-sweep] completed", {
    nowIso,
    ...summary,
  });

  return NextResponse.json(summary, { status: 200 });
}

export async function GET(req: Request) {
  return handleSweep(req);
}

export async function POST(req: Request) {
  return handleSweep(req);
}
