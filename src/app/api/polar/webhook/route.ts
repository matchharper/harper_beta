import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Polar } from "@polar-sh/sdk";
import { WebhookVerificationError, validateEvent } from "@polar-sh/sdk/webhooks";
import { POLAR_SERVER } from "@/lib/polar/config";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const POLAR_API_KEY =
  process.env.POLAR_API_KEY || process.env.POLAR_ACCESS_TOKEN || "";
const POLAR_WEBHOOK_SECRET =
  process.env.POLAR_WEBHOOK_SECRET ||
  process.env.POLAR_WEBHOOK_ENDPOINT_SECRET ||
  "";

const polarClient = POLAR_API_KEY
  ? new Polar({
      accessToken: POLAR_API_KEY,
      server: POLAR_SERVER,
    })
  : null;

type PlanRow = {
  plan_id: string;
  credit: number;
  name: string | null;
  ls_variant_id: string | null;
};

type PaymentRow = {
  id: number;
  plan_id: string | null;
  user_id: string | null;
  ls_subscription_id: string | null;
};

let planMapCache: Record<string, string> | null = null;

function safeStringify(v: unknown, limit = 5000) {
  try {
    const s = JSON.stringify(v);
    return s.length > limit ? s.slice(0, limit) + "…(truncated)" : s;
  } catch {
    return String(v);
  }
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function toIsoString(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v.toISOString();
  }
  const s = asString(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return null;
}

function getPlanMap() {
  if (planMapCache) return planMapCache;

  const raw = process.env.POLAR_PLAN_MAP_JSON;
  if (!raw) {
    planMapCache = {};
    return planMapCache;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      planMapCache = {};
      return planMapCache;
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const k = asString(key);
      const v = asString(value);
      if (k && v) normalized[k] = v;
    }
    planMapCache = normalized;
    return planMapCache;
  } catch {
    planMapCache = {};
    return planMapCache;
  }
}

async function insertLog(userId: string | null, type: string) {
  try {
    void userId;
    const { error } = await supabaseAdmin.from("new_logs").insert({ type });
    if (error) {
      console.error("insertLog failed:", error);
    }
  } catch (e) {
    console.error("insertLog exception:", e);
  }
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

async function getPlanByPlanId(planId: string) {
  const { data, error } = await supabaseAdmin
    .from("plans")
    .select("plan_id, credit, name, ls_variant_id")
    .eq("plan_id", planId)
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
  return (data ?? null) as PaymentRow | null;
}

async function getActiveSubscriptionsForUser(userId: string, excludeId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("ls_subscription_id, current_period_end, cancel_at_period_end")
    .eq("user_id", userId)
    .not("ls_subscription_id", "is", null)
    .neq("ls_subscription_id", excludeId)
    .gte("current_period_end", nowIso)
    .order("current_period_end", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    ls_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean | null;
  }>;
}

async function revokeSubscriptionNow(subscriptionId: string, requestId: string) {
  if (!polarClient) {
    await insertLog(null, `[${requestId}] cancel_old_subscription:missing_polar_api_key`);
    return { ok: false };
  }

  try {
    await polarClient.subscriptions.revoke({
      id: subscriptionId,
    });
    await insertLog(
      null,
      `[${requestId}] cancel_old_subscription:success subscriptionId=${subscriptionId}`
    );
    return { ok: true };
  } catch (e: unknown) {
    await insertLog(
      null,
      `[${requestId}] cancel_old_subscription:fail subscriptionId=${subscriptionId} message=${safeStringify(
        e
      )}`
    );
    return { ok: false };
  }
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

  if (creditsRow?.id) {
    const { error } = await supabaseAdmin
      .from("credits")
      .update({
        charged_credit: creditAmount,
        remain_credit: creditAmount,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", creditsRow.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from("credits").insert({
      user_id: userId,
      charged_credit: creditAmount,
      remain_credit: creditAmount,
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

function getMetadata(source: any): Record<string, unknown> {
  if (!source || typeof source !== "object") return {};
  const metadata = source.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

function getUserIdFromEvent(event: any, existingPayment?: PaymentRow | null) {
  const data = event?.data ?? {};
  const eventMeta = getMetadata(data);
  const checkoutMeta = getMetadata(data?.checkout);
  const subscriptionMeta = getMetadata(data?.subscription);
  const customerMeta = getMetadata(data?.customer);

  return pickFirstString(
    eventMeta.user_id,
    eventMeta.userId,
    eventMeta.uid,
    checkoutMeta.user_id,
    checkoutMeta.userId,
    subscriptionMeta.user_id,
    subscriptionMeta.userId,
    customerMeta.user_id,
    customerMeta.userId,
    data?.customer?.externalId,
    data?.customer?.external_id,
    data?.externalCustomerId,
    data?.external_customer_id,
    data?.checkout?.externalCustomerId,
    data?.checkout?.external_customer_id,
    data?.checkout?.customerExternalId,
    data?.checkout?.customer_external_id,
    data?.userId,
    existingPayment?.user_id
  );
}

function getCandidatePlanIdsFromEvent(event: any) {
  const data = event?.data ?? {};
  const ids = new Set<string>();

  const push = (v: unknown) => {
    const s = asString(v);
    if (s) ids.add(s);
  };

  push(data?.productId);
  push(data?.product_id);
  push(data?.productPriceId);
  push(data?.product_price_id);
  push(data?.product?.id);
  push(data?.subscription?.productId);
  push(data?.subscription?.product_id);
  push(data?.subscription?.productPriceId);
  push(data?.subscription?.product_price_id);

  if (Array.isArray(data?.items)) {
    for (const item of data.items) {
      push(item?.productPriceId);
      push(item?.product_price_id);
    }
  }

  if (Array.isArray(data?.prices)) {
    for (const price of data.prices) {
      push(price?.id);
    }
  }

  if (Array.isArray(data?.subscription?.prices)) {
    for (const price of data.subscription.prices) {
      push(price?.id);
    }
  }

  return Array.from(ids);
}

async function resolvePlanForEvent(event: any, fallbackPlanId?: string | null) {
  if (fallbackPlanId) {
    const existingPlan = await getPlanByPlanId(fallbackPlanId);
    if (existingPlan) return existingPlan;
  }

  const data = event?.data ?? {};
  const eventMeta = getMetadata(data);
  const checkoutMeta = getMetadata(data?.checkout);
  const subscriptionMeta = getMetadata(data?.subscription);

  const metadataPlanId = pickFirstString(
    eventMeta.plan_id,
    eventMeta.planId,
    checkoutMeta.plan_id,
    checkoutMeta.planId,
    subscriptionMeta.plan_id,
    subscriptionMeta.planId
  );

  if (metadataPlanId) {
    const metadataPlan = await getPlanByPlanId(metadataPlanId);
    if (metadataPlan) return metadataPlan;
  }

  const candidates = getCandidatePlanIdsFromEvent(event);
  const planMap = getPlanMap();

  for (const candidate of candidates) {
    const mappedPlanId = planMap[candidate];
    if (!mappedPlanId) continue;
    const mappedPlan = await getPlanByPlanId(mappedPlanId);
    if (mappedPlan) return mappedPlan;
  }

  for (const candidate of candidates) {
    const byVariant = await getPlanByVariantId(candidate);
    if (byVariant) return byVariant;
  }

  return null;
}

function getSubscriptionIdFromEvent(event: any) {
  const data = event?.data ?? {};
  return pickFirstString(
    data?.id,
    data?.subscriptionId,
    data?.subscription_id,
    data?.subscription?.id
  );
}

async function getSubscriptionForOrder(order: any) {
  if (order?.subscription && typeof order.subscription === "object") {
    return order.subscription;
  }

  const subscriptionId = pickFirstString(order?.subscriptionId, order?.subscription_id);
  if (!subscriptionId || !polarClient) return null;

  try {
    return await polarClient.subscriptions.get({ id: subscriptionId });
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (e: unknown) {
    await insertLog(null, `[${requestId}] fail_read_body: ${safeStringify(e)}`);
    return NextResponse.json({ error: "Failed to read body" }, { status: 400 });
  }

  if (!POLAR_WEBHOOK_SECRET) {
    await insertLog(null, `[${requestId}] fail_missing_webhook_secret`);
    return NextResponse.json(
      { error: "Missing Polar webhook secret" },
      { status: 500 }
    );
  }

  let event: any;
  try {
    event = validateEvent(
      rawBody,
      Object.fromEntries(req.headers.entries()),
      POLAR_WEBHOOK_SECRET
    );
  } catch (e: unknown) {
    if (e instanceof WebhookVerificationError) {
      await insertLog(null, `[${requestId}] fail_invalid_signature`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    await insertLog(null, `[${requestId}] fail_validate_event: ${safeStringify(e)}`);
    return NextResponse.json({ error: "Failed to validate event" }, { status: 400 });
  }

  const eventType = asString(event?.type);
  if (!eventType) {
    await insertLog(null, `[${requestId}] fail_missing_event_type`);
    return NextResponse.json({ error: "Missing event type" }, { status: 400 });
  }

  const subscriptionId = getSubscriptionIdFromEvent(event);
  const existingPayment = subscriptionId
    ? await getPaymentBySubscriptionId(subscriptionId)
    : null;
  const userIdFromEvent = getUserIdFromEvent(event, existingPayment);

  await insertLog(
    userIdFromEvent,
    `[${requestId}] webhook_received type=${eventType} subscriptionId=${subscriptionId ?? "null"} userId=${userIdFromEvent ?? "null"
    }`
  );

  try {
    if (eventType === "subscription.created" || eventType === "subscription.active") {
      if (!subscriptionId) {
        await insertLog(
          userIdFromEvent,
          `[${requestId}] ${eventType}:ignored missing_subscriptionId`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const userId = userIdFromEvent;
      if (!userId) {
        await insertLog(userIdFromEvent, `[${requestId}] ${eventType}:ignored missing_userId`);
        return NextResponse.json({ ok: true, ignored: true });
      }

      const plan = await resolvePlanForEvent(event, existingPayment?.plan_id ?? null);
      if (!plan) {
        await insertLog(
          userId,
          `[${requestId}] ${eventType}:ignored unknown_plan candidates=${safeStringify(
            getCandidatePlanIdsFromEvent(event)
          )}`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const subscription = event?.data ?? {};
      const previousSubscriptions = await getActiveSubscriptionsForUser(userId, subscriptionId);
      const toCancel = previousSubscriptions.filter(
        (row) => row.ls_subscription_id && !row.cancel_at_period_end
      );
      if (toCancel.length > 0) {
        await insertLog(
          userId,
          `[${requestId}] cancel_old_subscription:start count=${toCancel.length}`
        );
        for (const row of toCancel) {
          await revokeSubscriptionNow(String(row.ls_subscription_id), requestId);
        }
      }

      await upsertPayment({
        subscriptionId,
        userId,
        planId: plan.plan_id ?? null,
        customerId: pickFirstString(
          subscription?.customerId,
          subscription?.customer_id,
          subscription?.customer?.id,
          event?.data?.customerId,
          event?.data?.customer_id
        ),
        currentPeriodStart: toIsoString(
          subscription?.currentPeriodStart ?? subscription?.current_period_start
        ),
        currentPeriodEnd: toIsoString(
          subscription?.currentPeriodEnd ??
            subscription?.current_period_end ??
            subscription?.endsAt ??
            subscription?.ends_at
        ),
        cancelAtPeriodEnd:
          typeof subscription?.cancelAtPeriodEnd === "boolean"
            ? subscription.cancelAtPeriodEnd
            : typeof subscription?.cancel_at_period_end === "boolean"
              ? subscription.cancel_at_period_end
              : null,
      });

      await insertLog(userId, `[${requestId}] ${eventType}:success`);
      return NextResponse.json({ ok: true });
    }

    if (eventType === "order.paid") {
      const order = event?.data ?? {};
      const orderSubscriptionId = pickFirstString(
        order?.subscriptionId,
        order?.subscription_id,
        order?.subscription?.id
      );
      const paymentFromOrderSubscription = orderSubscriptionId
        ? await getPaymentBySubscriptionId(orderSubscriptionId)
        : null;
      const userId = getUserIdFromEvent(event, paymentFromOrderSubscription);
      const plan = await resolvePlanForEvent(
        event,
        paymentFromOrderSubscription?.plan_id ?? null
      );

      if (!userId || !plan) {
        await insertLog(
          userIdFromEvent,
          `[${requestId}] order.paid:ignored missing_user_or_plan userId=${userId ?? "null"} plan=${plan ? plan.plan_id : "null"
          }`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      if (orderSubscriptionId) {
        const subscription = await getSubscriptionForOrder(order);
        const previousSubscriptions = await getActiveSubscriptionsForUser(
          userId,
          orderSubscriptionId
        );
        const toCancel = previousSubscriptions.filter(
          (row) => row.ls_subscription_id && !row.cancel_at_period_end
        );
        if (toCancel.length > 0) {
          await insertLog(
            userId,
            `[${requestId}] cancel_old_subscription:start count=${toCancel.length}`
          );
          for (const row of toCancel) {
            await revokeSubscriptionNow(String(row.ls_subscription_id), requestId);
          }
        }

        await upsertPayment({
          subscriptionId: orderSubscriptionId,
          userId,
          planId: plan.plan_id ?? null,
          customerId: pickFirstString(
            order?.customerId,
            order?.customer_id,
            order?.customer?.id,
            subscription?.customerId,
            subscription?.customer_id,
            subscription?.customer?.id
          ),
          currentPeriodStart: toIsoString(
            subscription?.currentPeriodStart ?? subscription?.current_period_start
          ),
          currentPeriodEnd: toIsoString(
            subscription?.currentPeriodEnd ??
              subscription?.current_period_end ??
              subscription?.endsAt ??
              subscription?.ends_at
          ),
          cancelAtPeriodEnd:
            typeof subscription?.cancelAtPeriodEnd === "boolean"
              ? subscription.cancelAtPeriodEnd
              : typeof subscription?.cancel_at_period_end === "boolean"
                ? subscription.cancel_at_period_end
                : null,
        });
      }

      await applyCredits(userId, plan);
      await insertLog(
        userId,
        `[${requestId}] order.paid:success subscriptionId=${orderSubscriptionId ?? "null"}`
      );
      return NextResponse.json({ ok: true });
    }

    if (eventType === "subscription.updated" || eventType === "subscription.uncanceled") {
      if (!subscriptionId) {
        await insertLog(
          userIdFromEvent,
          `[${requestId}] ${eventType}:ignored missing_subscriptionId`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const userId = userIdFromEvent;
      if (!userId) {
        await insertLog(userIdFromEvent, `[${requestId}] ${eventType}:ignored missing_userId`);
        return NextResponse.json({ ok: true, ignored: true });
      }

      const plan = await resolvePlanForEvent(event, existingPayment?.plan_id ?? null);
      if (!plan) {
        await insertLog(userId, `[${requestId}] ${eventType}:ignored unknown_plan`);
        return NextResponse.json({ ok: true, ignored: true });
      }

      const subscription = event?.data ?? {};
      await upsertPayment({
        subscriptionId,
        userId,
        planId: plan.plan_id ?? null,
        customerId: pickFirstString(
          subscription?.customerId,
          subscription?.customer_id,
          subscription?.customer?.id
        ),
        currentPeriodStart: toIsoString(
          subscription?.currentPeriodStart ?? subscription?.current_period_start
        ),
        currentPeriodEnd: toIsoString(
          subscription?.currentPeriodEnd ??
            subscription?.current_period_end ??
            subscription?.endsAt ??
            subscription?.ends_at
        ),
        cancelAtPeriodEnd:
          typeof subscription?.cancelAtPeriodEnd === "boolean"
            ? subscription.cancelAtPeriodEnd
            : typeof subscription?.cancel_at_period_end === "boolean"
              ? subscription.cancel_at_period_end
              : null,
      });

      await insertLog(userId, `[${requestId}] ${eventType}:success`);
      return NextResponse.json({ ok: true });
    }

    if (eventType === "subscription.canceled" || eventType === "subscription.revoked") {
      if (!subscriptionId) {
        await insertLog(
          userIdFromEvent,
          `[${requestId}] ${eventType}:ignored missing_subscriptionId`
        );
        return NextResponse.json({ ok: true, ignored: true });
      }

      const userId = userIdFromEvent;
      if (!userId) {
        await insertLog(userIdFromEvent, `[${requestId}] ${eventType}:ignored missing_userId`);
        return NextResponse.json({ ok: true, ignored: true });
      }

      const plan = await resolvePlanForEvent(event, existingPayment?.plan_id ?? null);
      if (!plan) {
        await insertLog(userId, `[${requestId}] ${eventType}:ignored unknown_plan`);
        return NextResponse.json({ ok: true, ignored: true });
      }

      const subscription = event?.data ?? {};
      const finalEnd =
        toIsoString(subscription?.endedAt ?? subscription?.ended_at) ||
        toIsoString(subscription?.endsAt ?? subscription?.ends_at) ||
        toIsoString(
          subscription?.currentPeriodEnd ?? subscription?.current_period_end
        ) ||
        new Date().toISOString();

      await upsertPayment({
        subscriptionId,
        userId,
        planId: plan.plan_id ?? null,
        customerId: pickFirstString(
          subscription?.customerId,
          subscription?.customer_id,
          subscription?.customer?.id
        ),
        currentPeriodStart: toIsoString(
          subscription?.currentPeriodStart ?? subscription?.current_period_start
        ),
        currentPeriodEnd: finalEnd,
        cancelAtPeriodEnd: true,
      });

      await insertLog(userId, `[${requestId}] ${eventType}:success`);
      return NextResponse.json({ ok: true });
    }

    await insertLog(
      userIdFromEvent,
      `[${requestId}] ignored_event type=${eventType}`
    );
    return NextResponse.json({ ok: true, ignored: true });
  } catch (e: unknown) {
    await insertLog(
      userIdFromEvent,
      `[${requestId}] handler_error event=${eventType} message=${safeStringify(e)}`
    );
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}
