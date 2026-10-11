import Stripe from "stripe";
import { slotPriceId } from "./compat";
import {
  WorkspaceBillingError,
  isSlotPurchaseQuantity,
  type BillingCatalog,
  type BillingInterval,
} from "./types";

export const STRIPE_BILLING_API_VERSION = "2026-09-30.endive";
// Dashboard currently offers Dahlia snapshot webhooks. These versions share
// the routing identifiers we read; all entitlements come from fresh SDK reads
// pinned to Endive, never from a webhook's subscription/invoice snapshot.
export const STRIPE_BILLING_WEBHOOK_VERSIONS = [
  STRIPE_BILLING_API_VERSION,
  "2026-08-26.dahlia",
];
let client: Stripe | undefined;
export function getBillingStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new WorkspaceBillingError("billing_unavailable", 503);
  return (client ??= new Stripe(key, {
    apiVersion: STRIPE_BILLING_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
  }));
}
export function billingSiteUrl() {
  const url = new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new WorkspaceBillingError("billing_unavailable", 503);
  }
  return url.origin;
}
export function stripeId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : (value?.id ?? null);
}
export function timestamp(value: number | null | undefined) {
  return value == null ? null : new Date(value * 1000).toISOString();
}
export async function getSlotPrice(interval: BillingInterval = "month") {
  const priceId = slotPriceId(interval);
  if (!priceId) throw new WorkspaceBillingError("billing_unavailable", 503);
  const price = await getBillingStripe().prices.retrieve(priceId);
  if (
    !price.active ||
    price.type !== "recurring" ||
    price.recurring?.interval !== interval ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== "licensed" ||
    price.billing_scheme !== "per_unit" ||
    price.unit_amount == null ||
    price.unit_amount <= 0 ||
    price.transform_quantity
  ) {
    throw new WorkspaceBillingError("billing_unavailable", 503);
  }
  return price;
}
export async function getBillingCatalog(): Promise<BillingCatalog> {
  if (!process.env.STRIPE_SECRET_KEY || !slotPriceId("month")) {
    return {
      available: false,
      amount: null,
      annualAmount: null,
      testMode: false,
      currency: null,
      taxBehavior: "unspecified",
    };
  }
  const [price, annual] = await Promise.all([
    getSlotPrice(),
    getSlotPrice("year"),
  ]);
  if (
    price.currency !== annual.currency ||
    price.livemode !== annual.livemode ||
    stripeId(price.product) !== stripeId(annual.product)
  )
    throw new WorkspaceBillingError("billing_unavailable", 503);
  return {
    available: true,
    amount: price.unit_amount,
    annualAmount: annual.unit_amount,
    testMode: !price.livemode,
    currency: price.currency,
    taxBehavior:
      price.tax_behavior === "inclusive"
        ? "inclusive"
        : price.tax_behavior === "exclusive"
          ? "exclusive"
          : "unspecified",
  };
}

// All boundaries are computed from the original anchor, not the previous
// boundary: Jan 31 -> Feb 28 -> Mar 31. Annual invoices fund twelve distinct
// monthly periods; only the period containing now can be spent.
export function monthlyCreditPeriods(
  period: { invoiceId: string; startsAt: string | null; endsAt: string | null },
  interval: BillingInterval,
  anchorSeconds?: number
) {
  if (!period.startsAt || !period.endsAt)
    throw new WorkspaceBillingError("billing_conflict");
  if (interval === "month") return [period];
  const start = new Date(period.startsAt);
  const end = new Date(period.endsAt);
  const anchorDay =
    anchorSeconds == null
      ? start.getUTCDate()
      : new Date(anchorSeconds * 1000).getUTCDate();
  const boundaries = [start];
  for (let offset = 1; offset < 12; offset++) {
    const boundary = new Date(start);
    boundary.setUTCDate(1);
    boundary.setUTCMonth(start.getUTCMonth() + offset);
    const days = new Date(
      Date.UTC(boundary.getUTCFullYear(), boundary.getUTCMonth() + 1, 0)
    ).getUTCDate();
    boundary.setUTCDate(Math.min(anchorDay, days));
    if (boundary >= end) throw new WorkspaceBillingError("billing_conflict");
    boundaries.push(boundary);
  }
  boundaries.push(end);
  return boundaries.slice(0, -1).map((boundary, index) => ({
    invoiceId: period.invoiceId,
    startsAt: boundary.toISOString(),
    endsAt: boundaries[index + 1].toISOString(),
  }));
}

// Only a paid recurring invoice grants a period. Prorations, standalone invoices,
// unpaid renewals and manual out-of-band settlement are never entitlements.
export function paidInvoicePeriod(
  invoice: Stripe.Invoice,
  subscription: Stripe.Subscription,
  settled = false
) {
  const item = subscription.items.data[0];
  if (
    !item ||
    subscription.items.data.length !== 1 ||
    !isSlotPurchaseQuantity(item.quantity) ||
    subscription.status === "trialing" ||
    invoice.status !== "paid" ||
    !settled ||
    invoice.collection_method !== "charge_automatically" ||
    !["subscription_create", "subscription_cycle"].includes(
      invoice.billing_reason ?? ""
    ) ||
    stripeId(invoice.parent?.subscription_details?.subscription) !==
      subscription.id ||
    stripeId(invoice.customer) !== stripeId(subscription.customer) ||
    invoice.lines.has_more
  )
    return null;
  const lines = invoice.lines.data.filter(
    (line) =>
      line.parent?.type === "subscription_item_details" &&
      !line.parent.subscription_item_details?.proration &&
      line.parent.subscription_item_details?.subscription_item === item.id &&
      stripeId(line.pricing?.price_details?.price) === item.price.id &&
      isSlotPurchaseQuantity(line.quantity)
  );
  if (
    lines.length !== 1 ||
    lines[0].period.end <= lines[0].period.start ||
    (subscription.trial_start != null &&
      subscription.trial_end != null &&
      lines[0].period.start < subscription.trial_end &&
      lines[0].period.end > subscription.trial_start)
  )
    return null;
  return {
    invoiceId: invoice.id,
    quantity: lines[0].quantity!,
    startsAt: timestamp(lines[0].period.start),
    endsAt: timestamp(lines[0].period.end),
  };
}
