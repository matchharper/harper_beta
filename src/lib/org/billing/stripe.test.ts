import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { paidInvoicePeriod, monthlyCreditPeriods } from "./stripe";
import {
  billingErrorCopy,
  formatBillingMoney,
  WorkspaceBillingError,
} from "./types";

const subscription = {
  id: "sub_1",
  customer: "cus_1",
  items: { data: [{ id: "si_1", quantity: 1, price: { id: "price_1" } }] },
} as unknown as Stripe.Subscription;
function invoice(patch: Record<string, unknown> = {}) {
  return {
    id: "in_1",
    status: "paid",
    customer: "cus_1",
    collection_method: "charge_automatically",
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: "sub_1" } },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          parent: {
            type: "subscription_item_details",
            subscription_item_details: {
              subscription_item: "si_1",
              proration: false,
            },
          },
          pricing: { price_details: { price: "price_1" } },
          period: { start: 1790816400, end: 1793494800 },
        },
      ],
    },
    ...patch,
  } as unknown as Stripe.Invoice;
}
test("only verified paid subscription cycles supply credit periods", () => {
  assert.deepEqual(paidInvoicePeriod(invoice(), subscription, true), {
    invoiceId: "in_1",
    quantity: 1,
    startsAt: new Date(1790816400 * 1000).toISOString(),
    endsAt: new Date(1793494800 * 1000).toISOString(),
  });
  for (const patch of [
    { status: "open" },
    { customer: "cus_other" },
    { billing_reason: "manual" },
    { billing_reason: "subscription_update" },
    { collection_method: "send_invoice" },
    { parent: { subscription_details: { subscription: "sub_other" } } },
  ]) {
    assert.equal(paidInvoicePeriod(invoice(patch), subscription, true), null);
  }
  assert.equal(
    paidInvoicePeriod(invoice(), subscription, false),
    null,
    "mark-paid without a verified settlement does not grant access"
  );
  const prorated = invoice();
  prorated.lines.data[0].parent!.subscription_item_details!.proration = true;
  assert.equal(paidInvoicePeriod(prorated, subscription, true), null);
  const multi = structuredClone(subscription);
  multi.items.data.push(multi.items.data[0]);
  assert.equal(
    paidInvoicePeriod(invoice(), multi, true),
    null,
    "quantity or multi-item changes fail closed"
  );
  const wrongPrice = invoice();
  wrongPrice.lines.data[0].pricing!.price_details!.price = "price_other";
  assert.equal(paidInvoicePeriod(wrongPrice, subscription, true), null);
  const afterTrial = {
    ...subscription,
    status: "active" as const,
    trial_start: 1790816400,
    trial_end: 1793494800,
  };
  assert.equal(
    paidInvoicePeriod(invoice(), afterTrial, true),
    null,
    "a delayed trial invoice cannot grant credits after the trial ends"
  );
  const paidRenewal = invoice();
  paidRenewal.lines.data[0].period = {
    start: afterTrial.trial_end,
    end: afterTrial.trial_end + 30 * 86400,
  };
  assert.ok(paidInvoicePeriod(paidRenewal, afterTrial, true));
});
test("raw Stripe webhook signatures reject tampering and expired delivery signatures", () => {
  const stripe = new Stripe("sk_test_local_fixture");
  const secret = "whsec_local_fixture";
  const payload = JSON.stringify({
    id: "evt_fixture",
    object: "event",
    type: "invoice.paid",
    data: { object: { id: "in_1" } },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(
    stripe.webhooks.constructEvent(payload, header, secret).id,
    "evt_fixture"
  );
  assert.throws(() =>
    stripe.webhooks.constructEvent(`${payload} `, header, secret)
  );
  const old = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  });
  assert.throws(() => stripe.webhooks.constructEvent(payload, old, secret));
});
test("credit notices belong to the UI transport; ordinary LLM errors carry no billing facts", () => {
  const error = new WorkspaceBillingError("credits_exhausted");
  assert.doesNotMatch(error.message, /credit|크레딧|차감/i);
  assert.match(billingErrorCopy(error.code, "ko"), /Harper/);
  assert.match(billingErrorCopy(error.code, "en"), /Harper/);
});
test("Stripe minor units display correctly for both KRW and USD", () => {
  assert.match(formatBillingMoney(149000, "krw", "ko"), /149,000/);
  assert.equal(formatBillingMoney(1999, "usd", "en"), "$19.99");
});

test("annual payments provide twelve monthly periods, preserving month-end and leap anchors", () => {
  for (const start of ["2026-01-31T10:30:00Z", "2028-02-29T10:30:00Z"]) {
    const end = start.startsWith("2028")
      ? "2029-02-28T10:30:00Z"
      : "2027-01-31T10:30:00Z";
    const periods = monthlyCreditPeriods(
      { invoiceId: "in_year", startsAt: start, endsAt: end },
      "year"
    );
    assert.equal(periods.length, 12);
    assert.equal(new Set(periods.map((p) => p.invoiceId)).size, 1);
    assert.equal(periods[0].startsAt, new Date(start).toISOString());
    assert.equal(periods[11].endsAt, new Date(end).toISOString());
    for (let i = 1; i < 12; i++)
      assert.equal(periods[i].startsAt, periods[i - 1].endsAt);
    if (start.startsWith("2026")) {
      assert.equal(periods[0].endsAt, "2026-02-28T10:30:00.000Z");
      assert.equal(periods[1].endsAt, "2026-03-31T10:30:00.000Z");
    }
  }
  const renewed = monthlyCreditPeriods(
    {
      invoiceId: "in_renew",
      startsAt: "2029-02-28T10:30:00Z",
      endsAt: "2030-02-28T10:30:00Z",
    },
    "year",
    Date.parse("2028-02-29T10:30:00Z") / 1000
  );
  assert.equal(renewed[0].endsAt, "2029-03-29T10:30:00.000Z");
  const monthly = {
    invoiceId: "in_month",
    startsAt: "2026-02-28T10:30:00Z",
    endsAt: "2026-03-31T10:30:00Z",
  };
  assert.deepEqual(monthlyCreditPeriods(monthly, "month"), [monthly]);
});

test("paid invoice quantity is independent of a reduced next-renewal quantity", () => {
  const paid = invoice();
  paid.lines.data[0].quantity = 3;
  const next = structuredClone(subscription);
  next.items.data[0].quantity = 2;
  assert.equal(paidInvoicePeriod(paid, next, true)?.quantity, 3);
  for (const invalid of [0, -1, 1.5, 101, null]) {
    paid.lines.data[0].quantity = invalid;
    assert.equal(paidInvoicePeriod(paid, next, true), null);
  }
});
