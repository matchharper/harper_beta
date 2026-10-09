import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { WorkspaceBillingError, type BillingSlot } from "./types";

function mockGrantDb(t: TestContext, response: unknown) {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://grants.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
  return t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin,
        "https://grants.invalid",
        "grants never call Stripe"
      );
      assert.equal(url.pathname, "/rest/v1/company_workspace_slots");
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }
  );
}

test("grant-only workspaces do not request Stripe prices", async (t) => {
  const fetch = mockGrantDb(t, []);
  const { withSlotPrices } = await import("./service");
  const grant = { id: "grant", source: "grant" } as BillingSlot;
  const result = await withSlotPrices("workspace", [grant]);
  assert.equal(result[0].source, "grant");
  assert.equal(result[0].recurringAmount, null);
  const request = new URL(String(fetch.mock.calls[0].arguments[0]));
  assert.equal(request.searchParams.get("stripe_price_id"), "not.is.null");
  assert.equal(fetch.mock.calls.length, 1);
});

test("direct cancellation and resume requests for a grant fail before Stripe", async (t) => {
  const fetch = mockGrantDb(t, { stripe_subscription_id: null, revision: 3 });
  const { updateSlotCancellation } = await import("./service");
  for (const cancel of [true, false]) {
    await assert.rejects(
      updateSlotCancellation("workspace", "grant", 3, cancel),
      (error: unknown) =>
        error instanceof WorkspaceBillingError &&
        error.code === "billing_conflict"
    );
  }
  assert.equal(fetch.mock.calls.length, 2);
});
