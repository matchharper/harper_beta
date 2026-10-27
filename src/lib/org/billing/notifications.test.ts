import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as uuid from "uuid";
import { formatBillingMoney } from "./types";
import { isSlotBillingProduct, SLOT_PRODUCT_KEY } from "./compat";

function fixture() {
  const rows = new Map<string, any>();
  const messages: any[] = [];
  let failSlack = false;
  let now = Date.now();
  const invoice = {
    id: "in_fixture",
    status: "paid",
    amount_paid: 49700,
    amount_due: 49700,
    currency: "usd",
    billing_reason: "subscription_create",
    customer: "cus_fixture",
    parent: { subscription_details: { subscription: "sub_fixture" } },
    lines: { data: [{ quantity: 2 }] },
  };
  const subscription = {
    id: "sub_fixture",
    metadata: { harper_product: SLOT_PRODUCT_KEY, workspace_id: "workspace" },
    items: { data: [{ price: { recurring: { interval: "month" } } }] },
  };
  const db = {
    from(table: string) {
      assert.equal(table, "company_billing_notifications");
      let patch: any;
      const filters: ((r: any) => boolean)[] = [];
      const query: any = {
        async upsert(row: any, options: any) {
          assert.equal(options.ignoreDuplicates, true);
          if (!rows.has(row.id))
            rows.set(row.id, {
              ...row,
              sent_at: null,
              attempt_after: new Date(now - 1).toISOString(),
            });
          return { error: null };
        },
        update(value: any) {
          patch = value;
          return query;
        },
        eq(key: string, value: any) {
          filters.push((r) => r[key] === value);
          return query;
        },
        is(key: string, value: any) {
          return query.eq(key, value);
        },
        lte(key: string, value: any) {
          filters.push((r) => r[key] <= value);
          return query;
        },
        select() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        async maybeSingle() {
          const r = await execute();
          return { data: r.data[0] ?? null, error: null };
        },
        then(resolve: any, reject: any) {
          return execute().then(resolve, reject);
        },
      };
      async function execute() {
        const matched = [...rows.values()].filter((r) =>
          filters.every((f) => f(r))
        );
        for (const r of matched) if (patch) Object.assign(r, patch);
        return { data: matched.map((r) => ({ ...r })), error: null };
      }
      return query;
    },
  };
  const dependencies: Record<string, any> = {
    uuid,
    "./store": {
      billingDb: () => db,
      billingWorkspace: async () => ({
        company_name: "Fixture <!channel>",
        stripe_customer_id: "cus_fixture",
      }),
      throwBillingDbError: (error: unknown) => {
        if (error) throw error;
      },
    },
    "./stripe": {
      getBillingStripe: () => ({
        invoices: { retrieve: async () => invoice },
        subscriptions: { retrieve: async () => subscription },
      }),
      stripeId: (v: any) => (typeof v === "string" ? v : (v?.id ?? null)),
    },
    "./compat": { isSlotBillingProduct },
    "./types": { formatBillingMoney },
    "@/lib/org/slackMessages": {
      escapeSlackText: (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    },
  };
  const loaded = { exports: {} as any };
  const env: Record<string, string> = { SLACK_BOT_TOKEN: "fixture-only" };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("./notifications.ts", import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }
    ).outputText,
    {
      module: loaded,
      exports: loaded.exports,
      require: (id: string) => {
        assert.ok(id in dependencies, id);
        return dependencies[id];
      },
      process: { env },
      console: { error() {} },
      AbortSignal,
      Date: class extends Date {
        constructor(value?: any) {
          super(value ?? now);
        }
        static now() {
          return now;
        }
      },
      fetch: async (url: string, options: any) => {
        assert.equal(url, "https://slack.com/api/chat.postMessage");
        const message = JSON.parse(options.body);
        assert.equal(message.channel, "C0AKK93FMH8");
        assert.ok(options.signal);
        messages.push(message);
        return {
          ok: !failSlack,
          status: failSlack ? 429 : 200,
          json: async () =>
            failSlack
              ? { ok: false, error: "ratelimited" }
              : { ok: true, ts: "123.456" },
        };
      },
    }
  );
  const event = (type = "invoice.paid", id = "evt_fixture") => ({
    id,
    type,
    livemode: true,
    data: {
      object: type.startsWith("invoice.")
        ? invoice
        : { invoice: invoice.id, metadata: subscription.metadata },
    },
  });
  return {
    ...loaded.exports,
    rows,
    messages,
    invoice,
    subscription,
    event,
    env,
    fail: (value: boolean) => {
      failSlack = value;
    },
    advance: () => {
      now += 301_000;
    },
  };
}

test("first payment, duplicate invoice events and checkout completion produce one internal alert", async () => {
  const f = fixture();
  await Promise.all([
    f.recordBillingWebhookNotification(f.event()),
    f.recordBillingWebhookNotification(
      f.event("invoice.payment_succeeded", "evt_second")
    ),
    f.recordBillingWebhookNotification(
      f.event("checkout.session.completed", "evt_checkout")
    ),
  ]);
  await f.recordBillingWebhookNotification(f.event());
  assert.equal(f.messages.length, 1);
  assert.equal(f.rows.size, 1);
  assert.match(f.messages[0].text, /구독 결제 완료/);
  assert.match(f.messages[0].text, /US\$497\.00/);
  assert.match(f.messages[0].text, /2개 · 월간/);
  assert.match(f.messages[0].text, /&lt;!channel&gt;/);
  assert.equal(f.rows.get("invoice:in_fixture:paid").slack_ts, "123.456");
});

test("renewals, payment failures and required authentication are distinguishable", async () => {
  const f = fixture();
  f.invoice.billing_reason = "subscription_cycle";
  await f.recordBillingWebhookNotification(f.event());
  assert.match(f.messages[0].text, /구독 갱신 결제 완료/);
  f.invoice.status = "open";
  await f.recordBillingWebhookNotification(
    f.event("invoice.payment_failed", "evt_failed")
  );
  await f.recordBillingWebhookNotification(
    f.event("invoice.payment_action_required", "evt_auth")
  );
  assert.match(f.messages[1].text, /결제 실패/);
  assert.match(f.messages[2].text, /추가 인증 필요/);
});

test("failed delivery stays pending and cron retry saves a receipt with stable message identity", async () => {
  const f = fixture();
  f.fail(true);
  await f.recordBillingWebhookNotification(f.event());
  assert.equal(f.rows.get("invoice:in_fixture:paid").sent_at, null);
  assert.equal(
    f.rows.get("invoice:in_fixture:paid").last_error,
    "slack_ratelimited"
  );
  await f.retryBillingNotifications();
  assert.equal(f.messages.length, 1);
  f.fail(false);
  f.advance();
  await f.retryBillingNotifications();
  assert.equal(f.messages.length, 2);
  assert.equal(f.messages[0].client_msg_id, f.messages[1].client_msg_id);
  assert.ok(f.rows.get("invoice:in_fixture:paid").sent_at);
  await f.retryBillingNotifications();
  assert.equal(f.messages.length, 2);
});

test("irrelevant events, other products, stale failures and test isolation never send", async () => {
  const f = fixture();
  await f.recordBillingWebhookNotification(f.event("invoice.created"));
  await f.recordBillingWebhookNotification(f.event("invoice.payment_failed"));
  f.subscription.metadata.harper_product = "other-product";
  await f.recordBillingWebhookNotification(f.event());
  f.subscription.metadata.harper_product = SLOT_PRODUCT_KEY;
  f.env.NEXT_PUBLIC_WORKER_TEST_MODE = "true";
  await f.recordBillingWebhookNotification(f.event());
  assert.equal(f.messages.length, 0);
  assert.equal(f.rows.size, 0);
});

test("successful payment reports a failed entitlement sync without calling it a failed charge", async () => {
  const f = fixture();
  await f.recordBillingWebhookNotification(f.event(), false);
  assert.match(f.messages[0].text, /구독 결제 완료/);
  assert.match(f.messages[0].text, /이용 권한 동기화 실패/);
});
