// Real Stripe TEST clocks -> signed CLI webhooks -> local app -> local database.
// Start scripts/workspaceBillingTest.mjs first. Never reads Live Stripe keys.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import Stripe from "stripe";
import dotenv from "dotenv";
import { root, stackEnv, readJson, writeJson } from "./localE2e/env.mjs";

const privateDir = path.join(root, ".local/billing-test/private");
const config = dotenv.parse(
  fs.readFileSync(path.join(privateDir, "stripe.env"))
);
assert.match(config.STRIPE_SECRET_KEY, /^(sk|rk)_test_/);
const stripe = new Stripe(config.STRIPE_SECRET_KEY, {
  apiVersion: "2026-09-30.endive",
});
const { env } = stackEnv();
execFileSync(
  path.join(root, ".local/full-stack/venv/bin/python"),
  ["scripts/localE2e/database.py", "check"],
  { cwd: root, env, stdio: "ignore" }
);
const fixture = readJson(path.join(privateDir, "fixture.json"));
const started = Math.floor(Date.now() / 1000);
const report = {
  startedAt: new Date().toISOString(),
  mode: "test",
  app: "http://localhost:3100",
  fixtures: [],
  checks: [],
};
const reportFile = path.join(privateDir, `clock-${started}.json`);
const iso = (time) => new Date(time * 1000).toISOString();
const save = () => writeJson(reportFile, report);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function db(command, f, values = {}) {
  return JSON.parse(
    execFileSync(
      path.join(root, ".local/full-stack/venv/bin/python"),
      ["scripts/localE2e/billingClock.py"],
      {
        cwd: root,
        env,
        input: JSON.stringify({ command, workspace: f.workspace, ...values }),
        encoding: "utf8",
        maxBuffer: 2e6,
      }
    )
  );
}
async function until(name, read, accepts, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    const value = await read();
    if (accepts(value)) return value;
    if (i % 10 === 0) console.log(`Waiting: ${name}`);
    await delay(1500);
  }
  throw Error(`Timed out: ${name}`);
}
async function advance(f, time) {
  await stripe.testHelpers.testClocks.advance(f.clock, { frozen_time: time });
  await until(
    "Stripe clock ready",
    () => stripe.testHelpers.testClocks.retrieve(f.clock),
    (c) => c.status === "ready"
  );
  f.at = time;
  save();
}
async function create(name, time) {
  const clock = await stripe.testHelpers.testClocks.create({
    name: `Harper ${name} ${started}`,
    frozen_time: time,
  });
  const workspace = randomUUID();
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    name: `Harper clock ${name}`,
    email: "billing-clock@harper.local.invalid",
    metadata: {
      workspace_id: workspace,
      harper_product: "workspace_slot_v1",
      testFixture: "stripe-billing-clock",
    },
  });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });
  const f = {
    name,
    workspace,
    clock: clock.id,
    customer: customer.id,
    at: time,
    subscriptions: [],
  };
  report.fixtures.push(f);
  save();
  db("seed", f, {
    name,
    user: fixture.userId,
    at: iso(time),
    customer: customer.id,
  });
  return f;
}
async function subscribe(f, interval) {
  const sub = await stripe.subscriptions.create({
    customer: f.customer,
    items: [
      {
        price:
          interval === "year"
            ? config.STRIPE_SLOT_ANNUAL_PRICE_ID
            : config.STRIPE_SLOT_PRICE_ID,
      },
    ],
    payment_behavior: "error_if_incomplete",
    metadata: {
      workspace_id: f.workspace,
      harper_product: "workspace_slot_v1",
    },
  });
  f.subscriptions.push(sub.id);
  save();
  return sub;
}
async function paidPeriods(f, n) {
  return until(
    `${f.name}: ${n} paid credit periods from real webhooks`,
    () => db("inspect", f),
    (s) => s.periods.length === n
  );
}
function check(f, name, values) {
  const result = db("assert", f, { name, at: iso(f.at), ...values });
  report.checks.push(result);
  save();
  console.log(
    `PASS ${name}: ${result.balance} credits, capacity ${result.capacity}`
  );
}
async function renew(f, subId) {
  const before = await stripe.subscriptions.retrieve(subId);
  const end = before.items.data[0].current_period_end;
  await advance(f, end);
  // Stripe deliberately leaves renewal invoices as drafts for about an hour.
  await advance(f, end + 7200);
  const sub = await stripe.subscriptions.retrieve(subId);
  const invoice = await stripe.invoices.retrieve(sub.latest_invoice);
  return { sub, invoice, end };
}
try {
  const catalog = await (
    await fetch("http://localhost:3100/api/billing/catalog")
  ).json();
  assert.ok(
    catalog.testMode ?? catalog.catalog?.testMode,
    "App must use Stripe TEST"
  );
  const m = await create("monthly-staggered", started);
  const first = await subscribe(m, "month");
  await paidPeriods(m, 1);
  check(m, "Monthly initial payment", {
    balance: 60,
    capacity: null,
    spend: 60,
    exhausted: true,
  });
  await advance(m, started + 10 * 86400);
  const second = await subscribe(m, "month");
  await paidPeriods(m, 2);
  check(m, "Two independently dated Slots", { balance: 110, capacity: null });
  const renewed = await renew(m, first.id);
  assert.equal(renewed.invoice.status, "paid");
  assert.equal(renewed.invoice.amount_paid, 24900);
  await paidPeriods(m, 3);
  check(m, "Monthly automatic charge and refill", {
    balance: 110,
    capacity: null,
  });
  check(m, "Unused credits expire without rollover", {
    at: iso(renewed.end - 1),
    balance: 110,
    capacity: null,
    spend: 7,
    nextAt: iso(m.at),
    nextBalance: 110,
  });
  await stripe.subscriptions.update(second.id, { cancel_at_period_end: true });
  await until(
    "cancellation webhook",
    () => db("inspect", m),
    (s) =>
      s.slots.some(
        (a) => a.stripe_subscription_id === second.id && a.cancel_at
      )
  );
  check(m, "Cancellation preserves paid access", { balance: 110, capacity: null });
  await advance(m, second.items.data[0].current_period_end + 7200);
  await until(
    "Slot ended webhook",
    () => db("inspect", m),
    (s) =>
      s.slots.some((a) => a.stripe_subscription_id === second.id && a.ended_at)
  );
  check(m, "One Slot ends while the other remains", {
    balance: 60,
    capacity: null,
  });
  const failedCard = await stripe.paymentMethods.attach(
    "pm_card_chargeCustomerFail",
    { customer: m.customer }
  );
  await stripe.customers.update(m.customer, {
    invoice_settings: { default_payment_method: failedCard.id },
  });
  const failed = await renew(m, first.id);
  assert.equal(failed.invoice.status, "open");
  assert.equal(failed.invoice.amount_paid, 0);
  await until(
    "past due webhook",
    () => db("inspect", m),
    (s) =>
      s.slots.some(
        (a) => a.stripe_subscription_id === first.id && a.status === "past_due"
      )
  );
  assert.equal(
    db("inspect", m).periods.length,
    3,
    "Failed invoice must not grant credits"
  );
  check(m, "Failed renewal grants no paid credits", {
    balance: 10,
    capacity: null,
    model: "free",
  });
  const recovery = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: m.customer,
  });
  await stripe.customers.update(m.customer, {
    invoice_settings: { default_payment_method: recovery.id },
  });
  await stripe.invoices.pay(failed.invoice.id, { payment_method: recovery.id });
  await paidPeriods(m, 4);
  check(m, "Pay failed invoice restores exactly 50", {
    balance: 60,
    capacity: null,
    model: "slot",
  });

  const y = await create(
    "annual-month-end",
    Date.parse("2028-01-31T12:00:00Z") / 1000
  );
  const annual = await subscribe(y, "year");
  await paidPeriods(y, 12);
  check(y, "Annual grants only current month", {
    balance: 60,
    capacity: null,
    spend: 60,
    exhausted: true,
  });
  const feb = Date.parse("2028-02-29T12:00:00Z") / 1000;
  await advance(y, feb);
  check(y, "Leap February monthly refill", { balance: 60, capacity: null });
  check(y, "Annual unused credits do not roll over", {
    at: "2028-02-29T11:59:59Z",
    balance: 60,
    capacity: null,
    spend: 13,
    nextAt: iso(feb),
    nextBalance: 60,
  });
  assert.equal(
    (await stripe.invoices.list({ customer: y.customer })).data.length,
    1,
    "Monthly credit refill must not charge annual subscribers"
  );
  await advance(y, Date.parse("2028-03-31T12:00:00Z") / 1000);
  check(y, "Month-end anchor returns to March 31", {
    balance: 60,
    capacity: null,
  });
  const yearlyRenewal = await renew(y, annual.id);
  assert.equal(yearlyRenewal.invoice.status, "paid");
  assert.equal(yearlyRenewal.invoice.amount_paid, 238800);
  await paidPeriods(y, 24);
  check(y, "Annual renewal charges 2388 USD; 50 paid + 10 shared", {
    balance: 60,
    capacity: null,
  });
  await stripe.subscriptions.update(annual.id, { cancel_at_period_end: true });
  await until(
    "annual cancellation webhook",
    () => db("inspect", y),
    (s) => s.slots.some((a) => a.cancel_at)
  );
  await advance(y, Date.parse("2029-02-28T12:00:00Z") / 1000);
  check(y, "Cancelled annual still refills prepaid months", {
    balance: 60,
    capacity: null,
  });
  await advance(y, yearlyRenewal.sub.items.data[0].current_period_end + 1);
  await until(
    "annual end webhook",
    () => db("inspect", y),
    (s) => s.slots.some((a) => a.ended_at)
  );
  check(y, "Annual access ends without another charge", {
    balance: 10,
    capacity: null,
    model: "free",
  });
  assert.equal(
    (await stripe.invoices.list({ customer: y.customer })).data.length,
    2
  );
  report.checks.push(db("concurrency", m));
  report.complete = true;
  save();
  console.log(
    `All ${report.checks.length} clock assertions passed. Report: ${path.relative(root, reportFile)}`
  );
} catch (error) {
  report.complete = false;
  report.failure = error.message;
  save();
  console.error(error.message);
  process.exitCode = 1;
}
