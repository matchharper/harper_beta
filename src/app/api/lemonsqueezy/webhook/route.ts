import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const SIGNING_SECRET =
  process.env.LEMON_SQUEEZY_SIGNING_SECRET || process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

type PlanRow = {
  plan_id: string;
  credit: number;
  name: string | null;
  ls_variant_id: string | null;
};

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
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") ?? "";

  if (!SIGNING_SECRET) {
    return NextResponse.json(
      { error: "Missing Lemon Squeezy signing secret" },
      { status: 500 }
    );
  }

  console.log("signature", signature);
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  console.log("rawBody", rawBody);
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err: any) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const eventName = getEventName(req, payload);
  console.log("eventName", eventName);
  if (!eventName) {
    return NextResponse.json({ error: "Missing event name" }, { status: 400 });
  }

  const userIdFromCustom = getCustomUserId(payload);

  console.log("userIdFromCustom", userIdFromCustom);

  if (eventName === "subscription_created") {
    const subscriptionId = getSubscriptionId(payload);
    const variantId = payload?.data?.attributes?.variant_id?.toString?.() ?? null;
    if (!subscriptionId || !variantId || !userIdFromCustom) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const plan = await getPlanByVariantId(variantId);
    console.log("plan", plan);
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan variant" }, { status: 400 });
    }

    await upsertPayment({
      subscriptionId,
      userId: String(userIdFromCustom),
      planId: plan.plan_id ?? null,
      customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
      currentPeriodStart: getSubscriptionDates(payload).currentPeriodStart,
      currentPeriodEnd: getSubscriptionDates(payload).currentPeriodEnd,
      cancelAtPeriodEnd: getSubscriptionDates(payload).cancelAtPeriodEnd,
    });
    console.log("upsertPayment", subscriptionId);

    return NextResponse.json({ ok: true });
  }

  if (eventName === "order_created") {
    const orderItem = payload?.data?.attributes?.first_order_item ?? null;
    const variantId = orderItem?.variant_id?.toString?.() ?? null;
    const subscriptionId = orderItem?.subscription_id ?? payload?.data?.attributes?.subscription_id ?? null;

    if (subscriptionId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (!variantId || !userIdFromCustom) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const plan = await getPlanByVariantId(variantId);
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan variant" }, { status: 400 });
    }

    await applyCredits(String(userIdFromCustom), plan);
    return NextResponse.json({ ok: true });
  }

  if (eventName === "subscription_payment_success") {
    const subscriptionId = getSubscriptionId(payload);
    if (!subscriptionId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payment = await getPaymentBySubscriptionId(subscriptionId);
    if (!payment?.plan_id || !payment?.user_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    await upsertPayment({
      subscriptionId,
      userId: payment.user_id,
      planId: payment.plan_id,
      customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
      currentPeriodStart: getSubscriptionDates(payload).currentPeriodStart,
      currentPeriodEnd: getSubscriptionDates(payload).currentPeriodEnd,
      cancelAtPeriodEnd: getSubscriptionDates(payload).cancelAtPeriodEnd,
    });

    const { data: plan, error } = await supabaseAdmin
      .from("plans")
      .select("plan_id, credit, name, ls_variant_id")
      .eq("plan_id", payment.plan_id)
      .maybeSingle();
    if (error) throw error;
    if (!plan) {
      return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    }

    await applyCredits(payment.user_id, plan as PlanRow);
    return NextResponse.json({ ok: true });
  }

  if (eventName === "subscription_cancelled" || eventName === "subscription_expired") {
    const subscriptionId = getSubscriptionId(payload);
    if (!subscriptionId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const payment = await getPaymentBySubscriptionId(subscriptionId);
    if (!payment?.user_id || !payment?.plan_id) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const dates = getSubscriptionDates(payload);
    const finalEnd = dates.currentPeriodEnd ?? dates.cancelledAt ?? new Date().toISOString();

    await upsertPayment({
      subscriptionId,
      userId: payment.user_id,
      planId: payment.plan_id,
      customerId: payload?.data?.attributes?.customer_id?.toString?.() ?? null,
      currentPeriodStart: dates.currentPeriodStart,
      currentPeriodEnd: finalEnd,
      cancelAtPeriodEnd: true,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: true });
}
