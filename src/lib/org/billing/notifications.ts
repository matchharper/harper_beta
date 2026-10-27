import type Stripe from "stripe";
import { v5 as uuidv5 } from "uuid";
import { billingDb, billingWorkspace, throwBillingDbError } from "./store";
import { getBillingStripe, stripeId } from "./stripe";
import { isSlotBillingProduct } from "./compat";
import { formatBillingMoney } from "./types";
import { escapeSlackText } from "@/lib/org/slackMessages";

// Harper's internal channel, never a customer's connected workspace/channel.
export const BILLING_SLACK_CHANNEL = "C0AKK93FMH8";
type PaymentFacts = {
  workspaceId: string;
  companyName: string;
  invoiceId: string;
  subscriptionId: string;
  eventId: string;
  eventType: string;
  amount: number;
  currency: string;
  reason: string | null;
  quantity: number;
  interval: string | null;
  live: boolean;
  billingSynced: boolean;
};
type Notice = { id: string; event_type: string; facts: PaymentFacts };

export function billingNotificationText(notice: Notice) {
  const f = notice.facts;
  const title =
    notice.event_type === "paid"
      ? f.reason === "subscription_cycle"
        ? "구독 갱신 결제 완료"
        : "구독 결제 완료"
      : notice.event_type === "failed"
        ? "구독 결제 실패"
        : "구독 결제 추가 인증 필요";
  return [
    `*${f.live ? "" : "[TEST] "}${title}*`,
    `회사: ${escapeSlackText(f.companyName)}`,
    `${notice.event_type === "paid" ? "결제 금액" : "청구 금액"}: ${formatBillingMoney(f.amount, f.currency, "ko")}`,
    `슬롯: ${f.quantity}개 · ${f.interval === "year" ? "연간" : f.interval === "month" ? "월간" : "주기 미확인"}`,
    ...(!f.billingSynced
      ? ["이용 권한 동기화 실패 · 서버 로그 확인 필요"]
      : []),
    `Workspace: ${f.workspaceId}`,
    `Invoice: ${f.invoiceId} · Subscription: ${f.subscriptionId}`,
    `Stripe event: ${f.eventId} (${f.eventType})`,
  ].join("\n");
}

export async function deliverBillingNotification(id: string) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return;
  const db = billingDb();
  const now = new Date();
  // Atomic lease across concurrent webhooks and the existing billing cron.
  const lease = new Date(now.getTime() + 60_000).toISOString();
  const { data, error } = await db
    .from("company_billing_notifications")
    .update({ attempt_after: lease })
    .eq("id", id)
    .is("sent_at", null)
    .lte("attempt_after", now.toISOString())
    .select("id,event_type,facts")
    .maybeSingle();
  throwBillingDbError(error);
  if (!data) return;
  try {
    const token = process.env.SLACK_BOT_TOKEN?.trim();
    if (!token) throw new Error("SLACK_BOT_TOKEN missing");
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: BILLING_SLACK_CHANNEL,
        client_msg_id: uuidv5(`billing:${id}`, uuidv5.URL),
        text: billingNotificationText(data as Notice),
        unfurl_links: false,
        unfurl_media: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      error?: string;
      ts?: string;
    };
    if (!response.ok || !result.ok || !result.ts)
      throw new Error(`slack_${result.error ?? response.status}`);
    const { error: saveError } = await db
      .from("company_billing_notifications")
      .update({
        sent_at: new Date().toISOString(),
        slack_ts: result.ts,
        last_error: null,
      })
      .eq("id", id)
      .eq("attempt_after", lease);
    throwBillingDbError(saveError);
  } catch (error) {
    // A stable client_msg_id also protects retries after an ambiguous response.
    // Slack and our database are not a single transaction: exactly-once delivery
    // cannot be guaranteed if Slack accepted a message but its receipt was lost.
    const code = error instanceof Error ? error.message : "delivery_failed";
    const { error: saveError } = await db
      .from("company_billing_notifications")
      .update({
        last_error: code,
        attempt_after: new Date(Date.now() + 300_000).toISOString(),
      })
      .eq("id", id)
      .eq("attempt_after", lease);
    if (saveError) console.error("[billing/slack:receipt]", id, saveError);
    console.error("[billing/slack]", id, code);
  }
}

// Runs after the signed webhook response; payment and entitlement outcomes
// remain distinct even when synchronization returns an error.
export async function recordBillingWebhookNotification(
  event: Stripe.Event,
  billingSynced = true
) {
  if (process.env.NEXT_PUBLIC_WORKER_TEST_MODE === "true") return;
  let invoiceId: string | null = null;
  let kind: string;
  if (
    event.type === "invoice.paid" ||
    event.type === "invoice.payment_succeeded"
  ) {
    invoiceId = (event.data.object as Stripe.Invoice).id;
    kind = "paid";
  } else if (
    event.type === "invoice.payment_failed" ||
    event.type === "invoice.payment_action_required"
  ) {
    invoiceId = (event.data.object as Stripe.Invoice).id;
    kind =
      event.type === "invoice.payment_failed" ? "failed" : "action_required";
  } else if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isSlotBillingProduct(session.metadata?.harper_product)) return;
    invoiceId = stripeId(session.invoice);
    kind = "paid";
  } else return;
  if (!invoiceId) return;
  const stripe = getBillingStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = stripeId(
    invoice.parent?.subscription_details?.subscription
  );
  if (!subscriptionId || (kind === "paid" && invoice.status !== "paid")) return;
  // Do not send a stale failure alert after a later successful retry.
  if (kind !== "paid" && invoice.status === "paid") return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (!isSlotBillingProduct(subscription.metadata.harper_product)) return;
  const workspaceId = subscription.metadata.workspace_id;
  const workspace = await billingWorkspace(workspaceId);
  if (stripeId(invoice.customer) !== workspace.stripe_customer_id)
    throw new Error("billing_notification_customer_mismatch");
  const id =
    kind === "paid" ? `invoice:${invoiceId}:paid` : `event:${event.id}`;
  const facts: PaymentFacts = {
    workspaceId,
    companyName: workspace.company_name,
    invoiceId,
    subscriptionId,
    eventId: event.id,
    eventType: event.type,
    amount: kind === "paid" ? invoice.amount_paid : invoice.amount_due,
    currency: invoice.currency,
    reason: invoice.billing_reason,
    quantity: invoice.lines.data.reduce(
      (sum, line) => sum + (line.quantity ?? 0),
      0
    ),
    interval: subscription.items.data[0]?.price.recurring?.interval ?? null,
    live: event.livemode,
    billingSynced,
  };
  const { error } = await billingDb()
    .from("company_billing_notifications")
    .upsert(
      {
        id,
        company_workspace_id: workspaceId,
        event_type: kind,
        facts,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
  throwBillingDbError(error);
  await deliverBillingNotification(id);
}

export async function retryBillingNotifications(limit = 20) {
  const { data, error } = await billingDb()
    .from("company_billing_notifications")
    .select("id")
    .is("sent_at", null)
    .lte("attempt_after", new Date().toISOString())
    .order("attempt_after")
    .limit(limit);
  throwBillingDbError(error);
  await Promise.all(
    (data ?? []).map((row) => deliverBillingNotification(row.id))
  );
}
