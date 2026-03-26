import { NextResponse } from "next/server";
import {
  addBillingPeriod,
  buildOrderId,
  cycleToBilling,
  type BillingAttemptReason,
} from "@/lib/billing/common";
import {
  createProcessingAttempt,
  createSupabaseAdminClient,
  getCompanyUserSummary,
  getExistingAttemptConflictCode,
  getLatestTossPaymentForUser,
  getPaymentAttemptByAttemptKey,
  getTossCustomerKeyForUser,
  resetCreditsForPlan,
  updatePaymentAttempt,
} from "@/lib/billing/server";
import {
  approveBilling,
  deleteBillingKey,
  issueBillingKey,
  TossRequestError,
} from "@/lib/toss/server";

export const runtime = "nodejs";

type ConfirmBody = {
  sessionToken?: string;
  authKey?: string;
  customerKey?: string;
};

function getCustomerIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return req.headers.get("x-real-ip");
}

function getPlanOrderName(planName: string) {
  return `Harper ${planName} 구독`.slice(0, 100);
}

export async function POST(req: Request) {
  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionToken = String(body?.sessionToken ?? "").trim();
  const authKey = String(body?.authKey ?? "").trim();
  const customerKey = String(body?.customerKey ?? "").trim();

  if (!sessionToken || !authKey || !customerKey) {
    return NextResponse.json(
      { error: "Missing sessionToken, authKey, or customerKey" },
      { status: 400 }
    );
  }

  const supabaseAdmin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await supabaseAdmin
    .from("billing_sessions")
    .select("*")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json(
      { error: "Failed to load billing session" },
      { status: 500 }
    );
  }

  if (!session) {
    return NextResponse.json({ error: "Billing session not found" }, { status: 404 });
  }

  const now = new Date();
  const expiresAt = new Date(session.expires_at);
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt < now && session.status === "pending") {
    await supabaseAdmin
      .from("billing_sessions")
      .update({
        status: "expired",
        updated_at: now.toISOString(),
      })
      .eq("id", session.id);

    return NextResponse.json(
      { error: "Billing session expired" },
      { status: 410 }
    );
  }

  if (customerKey !== getTossCustomerKeyForUser(session.user_id)) {
    return NextResponse.json(
      { error: "customerKey does not match the billing session" },
      { status: 400 }
    );
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from("plans")
    .select("plan_id, name, display_name, cycle, credit, price_krw")
    .eq("plan_id", session.plan_id)
    .maybeSingle();

  if (planError || !plan) {
    return NextResponse.json(
      { error: "Failed to load billing plan" },
      { status: 500 }
    );
  }

  if (session.status === "consumed") {
    if (session.payment_id) {
      const { data: existingPaymentData } = await supabaseAdmin
        .from("payments")
        .select("id, provider_status, current_period_end")
        .eq("id", session.payment_id)
        .maybeSingle();

      const existingPayment = (existingPaymentData as unknown) as {
        id: number;
        provider_status: string | null;
        current_period_end: string | null;
      } | null;

      return NextResponse.json(
        {
          status: "already_confirmed",
          paymentId: existingPayment?.id ?? session.payment_id,
          providerStatus: existingPayment?.provider_status ?? "active",
          currentPeriodEnd: existingPayment?.current_period_end ?? null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: "Billing session already consumed" },
      { status: 409 }
    );
  }

  if (session.status !== "pending") {
    return NextResponse.json(
      { error: `Billing session is ${session.status}` },
      { status: 409 }
    );
  }

  const companyUser = await getCompanyUserSummary(supabaseAdmin, session.user_id);
  const planName = plan.display_name ?? plan.name ?? session.plan_key;
  const attemptReason: BillingAttemptReason =
    session.reason === "recover" ? "recovery" : "initial_purchase";
  const attemptKey = `confirm:${session.session_token}`;
  const orderId = buildOrderId(
    session.reason === "recover" ? "recover" : "signup",
    session.session_token
  );

  let attempt;
  try {
    attempt = await createProcessingAttempt({
      supabaseAdmin,
      paymentId: session.payment_id,
      userId: session.user_id,
      provider: "toss",
      attemptKey,
      reason: attemptReason,
      planId: plan.plan_id,
      amountKRW: Number(session.amount_krw ?? 0),
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
      if (session.payment_id) {
        const { data: existingPaymentData } = await supabaseAdmin
          .from("payments")
          .select("id, provider_status, current_period_end")
          .eq("id", session.payment_id)
          .maybeSingle();

        const existingPayment = (existingPaymentData as unknown) as {
          id: number;
          provider_status: string | null;
          current_period_end: string | null;
        } | null;

        return NextResponse.json(
          {
            status: "already_confirmed",
            paymentId: existingPayment?.id ?? session.payment_id,
            providerStatus: existingPayment?.provider_status ?? "active",
            currentPeriodEnd: existingPayment?.current_period_end ?? null,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      { error: "Billing confirmation is already in progress" },
      { status: 409 }
    );
  }

  if (!attempt?.id) {
    return NextResponse.json(
      { error: "Failed to create payment attempt" },
      { status: 500 }
    );
  }

  let issuedBillingKey: string | null = null;

  try {
    const billing = await issueBillingKey({
      authKey,
      customerKey,
    });

    issuedBillingKey = billing.billingKey;

    const payment = await approveBilling({
      billingKey: billing.billingKey,
      amount: Number(session.amount_krw ?? 0),
      customerKey,
      orderId,
      orderName: getPlanOrderName(planName),
      customerEmail: companyUser?.email ?? undefined,
      customerName: companyUser?.name ?? undefined,
      customerIp: getCustomerIp(req) ?? undefined,
    });

    const billingPeriod = cycleToBilling(plan.cycle);
    if (!billingPeriod) {
      throw new Error("Unsupported billing cycle");
    }

    let previousPayment =
      session.reason === "recover"
        ? null
        : await getLatestTossPaymentForUser(supabaseAdmin, session.user_id);

    if (session.reason === "recover" && session.payment_id) {
      const { data: recoverPayment, error: recoverPaymentError } = await supabaseAdmin
        .from("payments")
        .select("*")
        .eq("id", session.payment_id)
        .maybeSingle();

      if (recoverPaymentError) {
        throw recoverPaymentError;
      }

      previousPayment = recoverPayment;
    }

    const startAnchor =
      session.reason === "recover" && previousPayment?.current_period_end
        ? new Date(previousPayment.current_period_end)
        : new Date(payment.approvedAt ?? now.toISOString());
    const currentPeriodStart = startAnchor.toISOString();
    const currentPeriodEnd = addBillingPeriod(startAnchor, billingPeriod).toISOString();

    const paymentPayload = {
      user_id: session.user_id,
      plan_id: plan.plan_id,
      provider: "toss",
      provider_status: "active",
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      next_charge_at: currentPeriodEnd,
      retry_next_at: null,
      retry_count: null,
      grace_ends_at: null,
      cancel_at_period_end: false,
      cancelled_at: null,
      ls_customer_id: null,
      ls_subscription_id: null,
      toss_customer_key: customerKey,
      toss_billing_key: billing.billingKey,
      toss_last_payment_key: payment.paymentKey,
      toss_last_order_id: payment.orderId,
      card_company:
        billing.cardCompany ??
        payment.card?.company ??
        previousPayment?.card_company ??
        null,
      card_number_masked:
        billing.cardNumber ??
        billing.card?.number ??
        payment.card?.number ??
        previousPayment?.card_number_masked ??
        null,
      updated_at: now.toISOString(),
    };

    let persistedPaymentId = session.payment_id ?? previousPayment?.id ?? null;
    if (persistedPaymentId) {
      const { data: updatedPayment, error: updateError } = await supabaseAdmin
        .from("payments")
        .update(paymentPayload)
        .eq("id", persistedPaymentId)
        .select("id")
        .maybeSingle();

      if (updateError) throw updateError;
      persistedPaymentId = updatedPayment?.id ?? persistedPaymentId;
    } else {
      const { data: insertedPayment, error: insertError } = await supabaseAdmin
        .from("payments")
        .insert(paymentPayload)
        .select("id")
        .maybeSingle();

      if (insertError) throw insertError;
      persistedPaymentId = insertedPayment?.id ?? null;
    }

    if (!persistedPaymentId) {
      throw new Error("Failed to persist payment");
    }

    await updatePaymentAttempt(supabaseAdmin, attempt.id, {
      payment_id: persistedPaymentId,
      status: "success",
      payment_key: payment.paymentKey,
      approved_at: payment.approvedAt ?? now.toISOString(),
      receipt_url: payment.receipt?.url ?? null,
      raw_response: payment as never,
    });

    await supabaseAdmin
      .from("billing_sessions")
      .update({
        status: "consumed",
        payment_id: persistedPaymentId,
        updated_at: now.toISOString(),
      })
      .eq("id", session.id);

    await resetCreditsForPlan({
      supabaseAdmin,
      userId: session.user_id,
      plan,
      eventType:
        session.reason === "recover"
          ? `${plan.name ?? session.plan_key}_subscription_recovery`
          : `${plan.name ?? session.plan_key}_subscription`,
    });

    const previousBillingKey =
      session.reason === "recover" ? previousPayment?.toss_billing_key : null;
    if (
      previousBillingKey &&
      previousBillingKey !== billing.billingKey
    ) {
      try {
        await deleteBillingKey(previousBillingKey);
      } catch {
        // Ignore cleanup failures; the new billing key is already active.
      }
    }

    return NextResponse.json(
      {
        status: "confirmed",
        paymentId: persistedPaymentId,
        providerStatus: "active",
        currentPeriodEnd,
      },
      { status: 200 }
    );
  } catch (error) {
    if (issuedBillingKey) {
      try {
        await deleteBillingKey(issuedBillingKey);
      } catch {
        // Ignore cleanup failures after a failed first charge.
      }
    }

    const message =
      error instanceof TossRequestError ? error.message : "Failed to confirm Toss billing";
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

    await supabaseAdmin
      .from("billing_sessions")
      .update({
        status: "failed",
        updated_at: now.toISOString(),
      })
      .eq("id", session.id);

    return NextResponse.json(
      {
        error: message,
        code,
      },
      { status }
    );
  }
}
