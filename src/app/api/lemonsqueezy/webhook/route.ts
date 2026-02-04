import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SIGNING_SECRET =
  process.env.LEMON_SQUEEZY_SIGNING_SECRET ||
  process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

type PlanRow = {
  plan_id: string;
  credit: number;
  name: string | null;
  ls_variant_id: string | null;
};

function safeStringify(v: any, limit = 5000) {
  try {
    const s = JSON.stringify(v);
    return s.length > limit ? s.slice(0, limit) + "…(truncated)" : s;
  } catch {
    return String(v);
  }
}

// Logs to `logs` table: (user_id, type) only.
// If you want richer debug info, you can include it inside `type` string.
async function insertLog(userId: string | null, type: string) {
  try {
    // If userId is unknown, still write a log with a placeholder.
    const uid = userId ?? "unknown";

    const { error } = await supabaseAdmin.from("logs").insert({
      user_id: uid,
      type,
    });

    // Do not throw from logging; avoid breaking webhook flow.
    if (error) {
      console.error("insertLog failed:", error);
    }
  } catch (e) {
    console.error("insertLog exception:", e);
  }
}

function verifySignature(rawBody: string, signatureHeader: string) {
  if (!SIGNING_SECRET) return false;
  if (!signatureHeader) return false;

  const sig = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const computedHex = crypto
    .createHmac("sha256", SIGNING_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = computedHex.trim().toLowerCase();
  const b = sig.trim().toLowerCase();

  if (a.length !== b.length) return false;

  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");
  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function getPlanByVariantId(variantId: string) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("plan_id, credit, name, ls_variant_id")
    .eq("ls_variant_id", variantId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as PlanRow | null;
}

async function getPaymentBySubscriptionId(subscriptionId: string) {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("id, plan_id, user_id, ls_subscription_id")
    .eq("ls_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function upsertPayment(args: {
  subscriptionId: string;
  userId: string;
  planId: string | null;
  customerId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
}) {
  const existing = await getPaymentBySubscriptionId(args.subscriptionId);
  const payload = {
    user_id: args.userId,
    plan_id: args.planId,
    ls_subscription_id: args.subscriptionId,
    ls_customer_id: args.customerId,
    current_period_start: args.currentPeriodStart,
    current_period_end: args.currentPeriodEnd,
    cancel_at_period_end: args.cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("payments")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from("payments").insert(payload);
  if (error) throw error;
}

async function applyCredits(userId: string, plan: PlanRow) {
  const { data: creditsRow, error: creditsErr } = await supabaseAdmin
    .from("credits")
    .select("id, charged_credit, remain_credit")
    .eq("user_id", userId)
    .maybeSingle();
  if (creditsErr) throw creditsErr;

  const creditAmount = Number(plan.credit ?? 0);
  const nextCharged = (creditsRow?.charged_credit ?? 0) + creditAmount;
  const nextRemain = (creditsRow?.remain_credit ?? 0) + creditAmount;

  if (creditsRow?.id) {
    const { error } = await supabaseAdmin
      .from("credits")
      .update({
        charged_credit: nextCharged,
        remain_credit: nextRemain,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", creditsRow.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("credits").insert({
      user_id: userId,
      charged_credit: nextCharged,
      remain_credit: nextRemain,
      last_updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  const eventType = `${plan.name ?? "subscription"}_subscription`;
  const { error: historyErr } = await supabaseAdmin.from("credits_history").insert({
    user_id: userId,
    charged_credits: creditAmount,
    event_type: eventType,
  });
  if (historyErr) throw historyErr;
}

function getCustomUserId(payload: any) {
  const custom = payload?.meta?.custom_data ?? {};
  return custom.user_id ?? custom.userId ?? custom.uid ?? null;
}

function getEventName(req: Request, payload: any) {
  return req.headers.get("x-event-name") ?? payload?.meta?.event_name ?? null;
}

function getSubscriptionId(payload: any) {
  return (
    payload?.data?.attributes?.subscription_id ??
    payload?.data?.relationships?.subscription?.data?.id ??
    payload?.data?.attributes?.subscription?.id ??
    payload?.data?.id ??
    null
  );
}

function getSubscriptionDates(payload: any) {
  const attrs = payload?.data?.attributes ?? {};
  return {
    currentPeriodStart: attrs.current_period_start ?? attrs.created_at ?? null,
    currentPeriodEnd: attrs.current_period_end ?? attrs.renews_at ?? attrs.ends_at ?? null,
    cancelledAt: attrs.cancelled_at ?? null,
    cancelAtPeriodEnd:
      typeof attrs.cancel_at_period_end === "boolean"
        ? attrs.cancel_at_period_end
        : typeof attrs.cancelled === "boolean"
          ? attrs.cancelled
          : null,
  };
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  // Read raw body early (needed for signature verification)
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (e: any) {
    await insertLog(null, `[${requestId}] fail_read_body: ${safeStringify(e?.message ?? e)}`);
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  const signature = req.headers.get("x-signature") ?? "";
  const headerEventName = req.headers.get("x-event-name") ?? null;

  await insertLog(
    null,
    `[${requestId}] webhook_received: header_event=${headerEventName ?? "null"}, sig_present=${Boolean(
      signature
    )}, body_len=${rawBody.length}`
  );

  if (!SIGNING_SECRET) {
    await insertLog(null, `[${requestId}] fail_missing_signing_secret`);
    return NextResponse.json(
      { error: "Missing Lemon Squeezy signing secret" },
      { status: 500 }
    );
  }

  // Verify signature
  const sigOk = verifySignature(rawBody, signature);
  await insertLog(null, `[${requestId}] signature_check: ok=${sigOk}`);

  if (!sigOk) {
    // Avoid logging rawBody; it may contain PII. Only log small diagnostic info.
    await insertLog(
      null,
      `[${requestId}] fail_invalid_signature: sig_prefix=${(signature ?? "").slice(0, 16)}`
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse JSON payload
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (e: any) {
    await insertLog(null, `[${requestId}] fail_invalid_json: ${safeStringify(e?.message ?? e)}`);
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventName = getEventName(req, payload);
  const userIdFromCustom = getCustomUserId(payload);

  await insertLog(
    userIdFromCustom ? String(userIdFromCustom) : null,
    `[${requestId}] parsed: event=${eventName ?? "null"}, userIdFromCustom=${userIdFromCustom ? String(userIdFromCustom) : "null"
    }`
  );

  if (!eventName) {
    await insertLog(
      userIdFromCustom ? String(userIdFromCustom) : null,
      `[${requestId}] fail_missing_event_name`
    );
    return NextResponse.json({ error: "Missing event name" }, { status: 400 });
  }

  // Wrap each event handler with logging + error capture
  try {
    if (eventName === "subscription_created") {
      const subscriptionId = getSubscriptionId(payload);
      const variantId = payload?.data?.attributes?.variant_id?.toString?.() ?? null;

      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] subscription_created:start subscriptionId=${subscriptionId ?? "null"
        }, variantId=${variantId ?? "null"}`
      );

      if (!subscriptionId || !variantId || !userIdFromCustom) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] subscription_created:ignored missing_required_fields`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      await insertLog(String(userIdFromCustom), `[${requestId}] getPlanByVariantId:begin`);
      const plan = await getPlanByVariantId(variantId);
      await insertLog(
        String(userIdFromCustom),
        `[${requestId}] getPlanByVariantId:done plan=${plan ? plan.plan_id : "null"}`
      );

      if (!plan) {
        await insertLog(
          String(userIdFromCustom),
          `[${requestId}] subscription_created:fail unknown_plan_variant variantId=${variantId}`
        );
        return NextResponse.json({ error: "Unknown plan variant" }, { status: 400 });
      }

      const dates = getSubscriptionDates(payload);
      await insertLog(
        String(userIdFromCustom),
        `[${requestId}] upsertPayment:begin periodStart=${dates.currentPeriodStart ?? "null"} periodEnd=${dates.currentPeriodEnd ?? "null"
        }`
      );

      await upsertPayment({
        subscriptionId,
        userId: String(userIdFromCustom),
        planId: plan.plan_id ?? null,
        customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: dates.currentPeriodEnd,
        cancelAtPeriodEnd: dates.cancelAtPeriodEnd,
      });

      await insertLog(String(userIdFromCustom), `[${requestId}] upsertPayment:done`);
      await insertLog(String(userIdFromCustom), `[${requestId}] subscription_created:success`);
      return NextResponse.json({ ok: true });
    }

    if (eventName === "order_created") {
      const orderItem = payload?.data?.attributes?.first_order_item ?? null;
      const variantId = orderItem?.variant_id?.toString?.() ?? null;
      const subscriptionId =
        orderItem?.subscription_id ?? payload?.data?.attributes?.subscription_id ?? null;

      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] order_created:start variantId=${variantId ?? "null"} subscriptionId=${subscriptionId ?? "null"
        }`
      );

      // Subscription orders: ignore here (credits handled by subscription_payment_success)
      if (subscriptionId) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] order_created:ignored subscription_order`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      if (!variantId || !userIdFromCustom) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] order_created:ignored missing_required_fields`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      await insertLog(String(userIdFromCustom), `[${requestId}] getPlanByVariantId:begin`);
      const plan = await getPlanByVariantId(variantId);
      await insertLog(
        String(userIdFromCustom),
        `[${requestId}] getPlanByVariantId:done plan=${plan ? plan.plan_id : "null"}`
      );

      if (!plan) {
        await insertLog(
          String(userIdFromCustom),
          `[${requestId}] order_created:fail unknown_plan_variant variantId=${variantId}`
        );
        return NextResponse.json({ error: "Unknown plan variant" }, { status: 400 });
      }

      await insertLog(String(userIdFromCustom), `[${requestId}] applyCredits:begin`);
      await applyCredits(String(userIdFromCustom), plan);
      await insertLog(String(userIdFromCustom), `[${requestId}] applyCredits:done`);
      await insertLog(String(userIdFromCustom), `[${requestId}] order_created:success`);

      return NextResponse.json({ ok: true });
    }

    if (eventName === "subscription_payment_success") {
      const subscriptionId = getSubscriptionId(payload);

      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] subscription_payment_success:start subscriptionId=${subscriptionId ?? "null"}`
      );

      if (!subscriptionId) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] subscription_payment_success:ignored missing_subscriptionId`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] getPaymentBySubscriptionId:begin`
      );
      const payment = await getPaymentBySubscriptionId(subscriptionId);
      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] getPaymentBySubscriptionId:done found=${Boolean(payment)}`
      );

      if (!payment?.plan_id || !payment?.user_id) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] subscription_payment_success:ignored missing_plan_or_user payment=${safeStringify(
            payment
          )}`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const dates = getSubscriptionDates(payload);
      await insertLog(
        payment.user_id,
        `[${requestId}] upsertPayment:begin periodStart=${dates.currentPeriodStart ?? "null"} periodEnd=${dates.currentPeriodEnd ?? "null"
        }`
      );

      await upsertPayment({
        subscriptionId,
        userId: payment.user_id,
        planId: payment.plan_id,
        customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: dates.currentPeriodEnd,
        cancelAtPeriodEnd: dates.cancelAtPeriodEnd,
      });

      await insertLog(payment.user_id, `[${requestId}] upsertPayment:done`);

      await insertLog(payment.user_id, `[${requestId}] fetchPlanByPlanId:begin plan_id=${payment.plan_id}`);
      const { data: plan, error } = await supabaseAdmin
        .from("plans")
        .select("plan_id, credit, name, ls_variant_id")
        .eq("plan_id", payment.plan_id)
        .maybeSingle();
      if (error) throw error;

      await insertLog(
        payment.user_id,
        `[${requestId}] fetchPlanByPlanId:done found=${Boolean(plan)}`
      );

      if (!plan) {
        await insertLog(
          payment.user_id,
          `[${requestId}] subscription_payment_success:fail unknown_plan plan_id=${payment.plan_id}`
        );
        return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
      }

      await insertLog(payment.user_id, `[${requestId}] applyCredits:begin`);
      await applyCredits(payment.user_id, plan as PlanRow);
      await insertLog(payment.user_id, `[${requestId}] applyCredits:done`);
      await insertLog(payment.user_id, `[${requestId}] subscription_payment_success:success`);

      return NextResponse.json({ ok: true });
    }

    if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
      const subscriptionId = getSubscriptionId(payload);

      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] ${eventName}:start subscriptionId=${subscriptionId ?? "null"}`
      );

      if (!subscriptionId) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] ${eventName}:ignored missing_subscriptionId`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const payment = await getPaymentBySubscriptionId(subscriptionId);
      await insertLog(
        userIdFromCustom ? String(userIdFromCustom) : null,
        `[${requestId}] getPaymentBySubscriptionId:done found=${Boolean(payment)}`
      );

      if (!payment?.user_id || !payment?.plan_id) {
        await insertLog(
          userIdFromCustom ? String(userIdFromCustom) : null,
          `[${requestId}] ${eventName}:ignored missing_payment_fields payment=${safeStringify(payment)}`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const dates = getSubscriptionDates(payload);
      const finalEnd = dates.currentPeriodEnd ?? dates.cancelledAt ?? new Date().toISOString();

      await insertLog(
        payment.user_id,
        `[${requestId}] upsertPayment:begin finalEnd=${finalEnd}`
      );

      await upsertPayment({
        subscriptionId,
        userId: payment.user_id,
        planId: payment.plan_id,
        customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
        currentPeriodStart: dates.currentPeriodStart,
        currentPeriodEnd: finalEnd,
        cancelAtPeriodEnd: true,
      });

      await insertLog(payment.user_id, `[${requestId}] upsertPayment:done`);
      await insertLog(payment.user_id, `[${requestId}] ${eventName}:success`);

      return NextResponse.json({ ok: true });
    }

    await insertLog(
      userIdFromCustom ? String(userIdFromCustom) : null,
      `[${requestId}] ignored_event: ${eventName}`
    );
    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: any) {
    const uid = userIdFromCustom ? String(userIdFromCustom) : null;
    await insertLog(
      uid,
      `[${requestId}] handler_error event=${eventName} message=${safeStringify(e?.message ?? e)}`
    );
    // You might want to also log stack traces during dev:
    // await insertLog(uid, `[${requestId}] handler_error_stack ${safeStringify(e?.stack ?? "")}`);

    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}
