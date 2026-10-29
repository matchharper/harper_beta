// Real Stripe TEST + isolated SQL; never creates production customers or charges.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import { createWorkspaceBillingFixture, billingFixtureFetch } from "./lib/workspaceBillingFixture.mjs";

async function main() {
  const env = dotenv.parse(readFileSync(".local/billing-test/private/stripe.env"));
  assert.match(env.STRIPE_SECRET_KEY, /^(sk|rk)_test_/);
  Object.assign(process.env, env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://billing-fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-only-fixture-key",
    STRIPE_WEBHOOK_SECRET: "whsec_local_fixture",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
  });
  const db = await createWorkspaceBillingFixture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = billingFixtureFetch(db, originalFetch);
  const { getBillingStripe, getSlotPrice, getBillingCatalog, stripeId } = await import("../src/lib/org/billing/stripe");
  const { createSlotCheckout, syncBillingSubscription } = await import("../src/lib/org/billing/service");
  const { buildPromotionToken, readPromotion, PROMOTION_END, EARLY_TEAM_PRICE_LOOKUP } = await import("../src/lib/org/billing/promotion");
  const { SLOT_PRODUCT_KEY } = await import("../src/lib/org/billing/compat");
  const stripe = getBillingStripe();
  let customerId: string | undefined;
  let subscriptionId: string | undefined;
  const sessions: string[] = [];
  const scalar = async (sql: string, args: unknown[] = []) => Object.values((await db.query(sql, args)).rows[0] as object)[0] as any;
  try {
    const base = await getSlotPrice();
    let price = (await stripe.prices.list({ lookup_keys: [EARLY_TEAM_PRICE_LOOKUP] })).data[0];
    price ??= await stripe.prices.create({ product: stripeId(base.product)!, unit_amount: 19900, currency: "usd", recurring: { interval: "month" }, lookup_key: EARLY_TEAM_PRICE_LOOKUP }, { idempotencyKey: "early-teams-promotion-test-price-v1" });
    const token = buildPromotionToken("synthetic-test");
    assert.ok(readPromotion(token, PROMOTION_END - 1));
    assert.throws(() => readPromotion(token, PROMOTION_END));
    assert.throws(() => readPromotion(token + "tampered"));
    assert.equal((await getBillingCatalog(token)).amount, 19900);
    assert.equal((await getBillingCatalog()).amount, 24900);
    console.log("PASS invitation signature, deadline, promotional and normal catalog");
    const workspace = randomUUID();
    const customer = await stripe.customers.create({ name: "Synthetic early-team billing fixture", payment_method: "pm_card_visa", invoice_settings: { default_payment_method: "pm_card_visa" }, metadata: { testFixture: "workspace-promotion" } });
    customerId = customer.id;
    await db.query("insert into company_workspace(company_workspace_id,company_name,stripe_customer_id,billing_started_at) values($1,'Promotion fixture',$2,now())", [workspace, customer.id]);
    const sessionId = async () => (await scalar("select billing_checkout from company_workspace where company_workspace_id=$1", [workspace])).sessionId;
    const normal = await createSlotCheckout(workspace, "fixture", undefined, "ko", "month", 2);
    const normalId = await sessionId(); sessions.push(normalId);
    const promo = await createSlotCheckout(workspace, "fixture", undefined, "ko", "month", 2, { token, expectedUnitAmount: 19900 });
    const promoId = await sessionId(); sessions.push(promoId);
    assert.notEqual(normal.url, promo.url);
    assert.equal((await stripe.checkout.sessions.retrieve(normalId)).status, "expired");
    assert.equal((await stripe.checkout.sessions.retrieve(promoId)).amount_total, 39800);
    assert.equal((await createSlotCheckout(workspace, "fixture", undefined, "ko", "month", 2, { token, expectedUnitAmount: 19900 })).url, promo.url);
    await assert.rejects(createSlotCheckout(workspace, "fixture", undefined, "ko", "month", 1, { expectedUnitAmount: 19900 }));
    console.log("PASS $398 for two slots, old $498 checkout expired, duplicate reuse, missing-offer price mismatch rejected");
    const subscription = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id, quantity: 2 }], payment_behavior: "error_if_incomplete", metadata: { workspace_id: workspace, harper_product: SLOT_PRODUCT_KEY, slot_quantity: "2" } });
    subscriptionId = subscription.id;
    const invoice = await stripe.invoices.retrieve(stripeId(subscription.latest_invoice)!);
    assert.equal(invoice.status, "paid"); assert.equal(invoice.amount_paid, 39800);
    await syncBillingSubscription(subscription.id, workspace);
    await syncBillingSubscription(subscription.id, workspace);
    const summary = await scalar("select workspace_billing_summary_v2($1)", [workspace]);
    assert.equal(summary.slots.length, 2);
    assert.deepEqual(summary.creditSlots.map((s: any) => s.remaining).sort((a: number,b: number)=>a-b), [10,50,50]);
    console.log("PASS paid TEST invoice, two slots with 50 Intros each, shared 10, duplicate settlement is idempotent");
  } finally {
    for (const id of sessions) if ((await stripe.checkout.sessions.retrieve(id)).status === "open") await stripe.checkout.sessions.expire(id);
    if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId);
    if (customerId) await stripe.customers.del(customerId);
    globalThis.fetch = originalFetch;
    await db.close();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
