import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function fixture(invalid = false, syncFailure = false) {
  const callbacks: (() => Promise<void>)[] = [];
  let notified = 0;
  let synced = 0;
  const event = {
    id: "evt_fixture",
    type: "invoice.paid",
    api_version: "fixture",
  };
  const loaded = { exports: {} as any };
  const dependencies: Record<string, any> = {
    "next/server": {
      after: (cb: () => Promise<void>) => callbacks.push(cb),
      NextResponse: {
        json: (body: any, init?: any) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    },
    "@/lib/org/billing/stripe": {
      STRIPE_BILLING_WEBHOOK_VERSIONS: ["fixture"],
      getBillingStripe: () => ({
        webhooks: {
          constructEvent: () => {
            if (invalid) throw new Error("bad signature");
            return event;
          },
        },
      }),
    },
    "@/lib/org/billing/service": {
      handleBillingWebhook: async () => {
        synced++;
        if (syncFailure) throw new Error("entitlement unavailable");
      },
    },
    "@/lib/org/billing/notifications": {
      recordBillingWebhookNotification: () => {
        notified++;
        return new Promise(() => {});
      },
    },
  };
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(new URL("./route.ts", import.meta.url), "utf8"),
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
      console: { error() {} },
      process: { env: { STRIPE_WEBHOOK_SECRET: "fixture" } },
      require: (id: string) => {
        assert.ok(id in dependencies, id);
        return dependencies[id];
      },
    }
  );
  return {
    ...loaded.exports,
    callbacks,
    notified: () => notified,
    synced: () => synced,
  };
}
const request = {
  text: async () => "fixture",
  headers: { get: () => "signature" },
};
test("webhook responds before notification I/O starts, even if notification never finishes", async () => {
  const f = fixture();
  const result = await f.POST(request);
  assert.equal(result.status, 200);
  assert.equal(f.synced(), 1);
  assert.equal(f.notified(), 0);
  assert.equal(f.callbacks.length, 1);
  void f.callbacks[0]();
  assert.equal(f.notified(), 1);
});
test("invalid signatures never schedule payment alerts", async () => {
  const f = fixture(true);
  assert.equal((await f.POST(request)).status, 400);
  assert.equal(f.synced(), 0);
  assert.equal(f.callbacks.length, 0);
});

test("a failed entitlement sync returns its retry response and still schedules the payment alert", async () => {
  const f = fixture(false, true);
  assert.equal((await f.POST(request)).status, 500);
  assert.equal(f.notified(), 0);
  assert.equal(f.callbacks.length, 1);
});
