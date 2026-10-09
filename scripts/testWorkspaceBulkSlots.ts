// Real Stripe TEST payments and clocks + isolated Postgres + production service.
// Explicitly refuses live keys. Cleans up its Stripe clocks/customers on exit.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
import {
  createWorkspaceBillingFixture,
  billingFixtureFetch,
} from "./lib/workspaceBillingFixture.mjs";

async function main() {
  const env = dotenv.parse(
    readFileSync(".local/billing-test/private/stripe.env")
  );
  assert.match(env.STRIPE_SECRET_KEY, /^(sk|rk)_test_/, "TEST key required");
  Object.assign(process.env, env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://billing-fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "local-only-fixture-key",
    STRIPE_WEBHOOK_SECRET: "whsec_local_fixture",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
  });
  const db = await createWorkspaceBillingFixture();
  const fetch = globalThis.fetch;
  globalThis.fetch = billingFixtureFetch(db, fetch);
  const { getBillingStripe, stripeId } =
    await import("../src/lib/org/billing/stripe");
  const { slotPriceId, SLOT_PRODUCT_KEY } =
    await import("../src/lib/org/billing/compat");
  const {
    syncBillingSubscription,
    updateSlotCancellation,
    createSlotCheckout,
  } = await import("../src/lib/org/billing/service");
  const { recoverSubscriptionChange } =
    await import("../src/lib/org/billing/subscriptionChange");
  const stripe = getBillingStripe();
  const clocks: string[] = [];
  const checks: string[] = [];
  const report = {
    startedAt: new Date().toISOString(),
    checks,
    complete: false,
  };
  const scalar = async (sql: string, args: unknown[] = []) =>
    Object.values(
      (await db.query(sql, args)).rows[0] as Record<string, unknown>
    )[0] as any;
  const record = (text: string) => {
    checks.push(text);
    console.log(`PASS ${text}`);
  };
  const setNow = async (time: number) => {
    // Move ONLY this test DB clock to match Stripe. No production SQL changes.
    const at = new Date(time * 1000).toISOString();
    for (const row of (
      await db.query(
        "select pg_get_functiondef(oid) definition from pg_proc where pronamespace='public'::regnamespace and proname like 'workspace_billing_%' and prokind='f'"
      )
    ).rows as any[]) {
      const canonical = row.definition.replace(
        /'\d{4}-\d{2}-\d{2}T[0-9:.]+Z'::timestamptz/g,
        "clock_timestamp()"
      );
      if (canonical.includes("clock_timestamp()"))
        await db.exec(
          canonical.replaceAll("clock_timestamp()", `'${at}'::timestamptz`)
        );
    }
  };
  const advance = async (id: string, time: number) => {
    await stripe.testHelpers.testClocks.advance(id, { frozen_time: time });
    for (let n = 0; n < 60; n++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (
        (await stripe.testHelpers.testClocks.retrieve(id)).status === "ready"
      ) {
        await setNow(time);
        return;
      }
    }
    throw new Error("Stripe test clock timeout");
  };
  try {
    for (const interval of ["month", "year"] as const) {
      const now = Math.floor(Date.now() / 1000);
      await setNow(now);
      const workspace = randomUUID();
      const clock = await stripe.testHelpers.testClocks.create({
        frozen_time: now,
        name: `Harper bulk slots ${interval}`,
      });
      clocks.push(clock.id);
      const customer = await stripe.customers.create({
        test_clock: clock.id,
        name: "Harper bulk slot fixture",
        email: "bulk-billing@harper.local.invalid",
        payment_method: "pm_card_visa",
        invoice_settings: { default_payment_method: "pm_card_visa" },
        metadata: { testFixture: "workspace-bulk-slots" },
      });
      await db.query(
        "insert into company_workspace(company_workspace_id,company_name,stripe_customer_id,billing_started_at) values($1,'Bulk billing fixture',$2,now())",
        [workspace, customer.id]
      );
      const summary = () =>
        scalar("select workspace_billing_summary_v2($1)", [workspace]);
      // The production checkout path freezes quantity, reuses the same session,
      // and expires a mismatched quantity rather than charging an old selection.
      const checkout = await createSlotCheckout(
        workspace,
        "fixture",
        undefined,
        "en",
        interval,
        3
      );
      assert.ok(checkout.url);
      const same = await createSlotCheckout(
        workspace,
        "fixture",
        undefined,
        "en",
        interval,
        3
      );
      assert.equal(same.url, checkout.url);
      let sessionId = (
        await scalar(
          "select billing_checkout from company_workspace where company_workspace_id=$1",
          [workspace]
        )
      ).sessionId;
      const items = await stripe.checkout.sessions.listLineItems(sessionId);
      assert.equal(items.data[0].quantity, 3);
      assert.equal(
        items.data[0].amount_subtotal,
        (interval === "month" ? 24900 : 238800) * 3
      );
      const different = await createSlotCheckout(
        workspace,
        "fixture",
        undefined,
        "en",
        interval,
        2
      );
      assert.notEqual(different.url, checkout.url);
      assert.equal(
        (await stripe.checkout.sessions.retrieve(sessionId)).status,
        "expired"
      );
      sessionId = (
        await scalar(
          "select billing_checkout from company_workspace where company_workspace_id=$1",
          [workspace]
        )
      ).sessionId;
      await stripe.checkout.sessions.expire(sessionId);
      record(
        `${interval}: checkout quantity, total, duplicate protection and changed selection`
      );
      let subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: slotPriceId(interval), quantity: 3 }],
        payment_behavior: "error_if_incomplete",
        metadata: {
          workspace_id: workspace,
          harper_product: SLOT_PRODUCT_KEY,
          slot_quantity: "3",
        },
      });
      await syncBillingSubscription(subscription.id, workspace);
      let s = await summary();
      assert.equal(s.capacity, null);
      assert.deepEqual(
        s.creditSlots.map((x: any) => x.remaining),
        [10, 50, 50, 50]
      );
      assert.equal(
        await scalar(
          "select count(*)::int from company_workspace_credit_periods where company_workspace_id=$1 and slot_id is not null",
          [workspace]
        ),
        interval === "year" ? 36 : 3
      );
      const invoice = await stripe.invoices.retrieve(
        stripeId(subscription.latest_invoice)!
      );
      assert.equal(invoice.status, "paid");
      assert.equal(
        invoice.amount_paid,
        (interval === "year" ? 238800 : 24900) * 3
      );
      record(
        `${interval}: real test payment for three Slots, 50 credits each${interval === "year" ? ", twelve monthly periods each" : ""}`
      );
      const role = randomUUID();
      await db.query(
        "insert into company_roles(role_id,company_workspace_id,status,information) values($1,$2,'active',$3)",
        [
          role,
          workspace,
          JSON.stringify({
            testOnly: true,
            testFixture: "workspace-bulk-slots",
          }),
        ]
      );
      await scalar(
        "select workspace_billing_debit_v1($1,'intro_request','bulk-test',$2,$3,$4,'{}',true)",
        [workspace, role, randomUUID(), randomUUID()]
      );
      s = await summary();
      const chosen = s.slots.find((x: any) => x.roleId === role);
      await updateSlotCancellation(workspace, chosen.id, chosen.revision, true);
      subscription = await stripe.subscriptions.retrieve(subscription.id);
      assert.equal(subscription.items.data[0].quantity, 2);
      assert.equal(subscription.cancel_at_period_end, false);
      s = await summary();
      assert.equal(s.capacity, null);
      assert.equal(s.slots.find((x: any) => x.id === chosen.id).remaining, 49);
      assert.equal(
        (await stripe.invoices.list({ subscription: subscription.id })).data
          .length,
        1,
        "no proration invoice"
      );
      const resume = s.slots.find((x: any) => x.id === chosen.id);
      await updateSlotCancellation(
        workspace,
        resume.id,
        resume.revision,
        false
      );
      assert.equal(
        (await stripe.subscriptions.retrieve(subscription.id)).items.data[0]
          .quantity,
        3
      );
      s = await summary();
      assert.equal(s.slots.find((x: any) => x.id === chosen.id).cancelAt, null);
      record(
        `${interval}: individual cancellation/resume preserves credits and issues no proration charge`
      );
      // Lose the local finalize after Stripe succeeds, then recover twice.
      s = await summary();
      const target = s.slots.find((x: any) => x.id === chosen.id);
      const change = await scalar(
        "select workspace_billing_prepare_change_v1($1,$2,$3,true,$4,$5)",
        [
          workspace,
          target.id,
          target.revision,
          subscription.items.data[0].id,
          new Date(
            subscription.items.data[0].current_period_end * 1000
          ).toISOString(),
        ]
      );
      await stripe.subscriptions.update(
        subscription.id,
        {
          items: [{ id: change.itemId, quantity: change.quantity }],
          cancel_at_period_end: change.cancelSubscription,
          proration_behavior: "none",
        },
        { idempotencyKey: `workspace-slot-change:${change.id}` }
      );
      await recoverSubscriptionChange(workspace);
      await recoverSubscriptionChange(workspace);
      await syncBillingSubscription(subscription.id, workspace);
      record(`${interval}: lost response recovers idempotently`);
      const renewal = subscription.items.data[0].current_period_end;
      if (interval === "year") {
        const firstBoundary = await scalar(
          "select min(ends_at) from company_workspace_credit_periods where company_workspace_id=$1 and slot_id is not null",
          [workspace]
        );
        await advance(
          clock.id,
          Math.floor(new Date(firstBoundary).getTime() / 1000) + 1
        );
        s = await summary();
        assert.equal(s.capacity, null);
        assert.deepEqual(
          s.creditSlots.map((x: any) => x.remaining),
          [10, 50, 50, 50]
        );
        assert.equal(
          (await stripe.invoices.list({ subscription: subscription.id })).data
            .length,
          1
        );
        record(
          "year: monthly credit reset before annual cancellation without another charge"
        );
      }
      await advance(clock.id, renewal + 3600);
      // The clock may need one more hour for automatic invoice finalization.
      subscription = await stripe.subscriptions.retrieve(subscription.id);
      let nextInvoice = await stripe.invoices.retrieve(
        stripeId(subscription.latest_invoice)!
      );
      if (nextInvoice.status === "draft") {
        await advance(clock.id, renewal + 7200);
        subscription = await stripe.subscriptions.retrieve(subscription.id);
        nextInvoice = await stripe.invoices.retrieve(
          stripeId(subscription.latest_invoice)!
        );
      }
      assert.equal(nextInvoice.status, "paid");
      assert.equal(
        nextInvoice.amount_paid,
        (interval === "year" ? 238800 : 24900) * 2
      );
      await syncBillingSubscription(subscription.id, workspace);
      s = await summary();
      assert.equal(s.capacity, null);
      assert.equal(s.slots.find((x: any) => x.id === chosen.id).active, false);
      assert.deepEqual(
        s.creditSlots.map((x: any) => x.remaining),
        [10, 50, 50]
      );
      await syncBillingSubscription(subscription.id, workspace, invoice.id);
      assert.equal((await summary()).capacity, null);
      record(
        `${interval}: renewal charges exactly two Slots and grants only those Slots fresh credits; old invoice replay is harmless`
      );
    }
    report.complete = true;
  } finally {
    for (const id of clocks)
      await stripe.testHelpers.testClocks
        .del(id)
        .catch((error) =>
          console.error("Test clock cleanup failed:", id, error.message)
        );
    globalThis.fetch = fetch;
    await db.close();
    mkdirSync(".local/billing-test/private", { recursive: true });
    writeFileSync(
      ".local/billing-test/private/bulk-slots-report.json",
      JSON.stringify(report, null, 2),
      { mode: 0o600 }
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
