import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { WorkspaceBillingError } from "./types";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const summary = {
  workspaceId,
  model: "slot",
  activeRoles: 1,
  capacity: 1,
  creditSlots: [
    {
      id: "slot-fixture",
      slotId: "slot-fixture",
      label: "Slot 1",
      roleId: null,
      roleName: null,
      remaining: 0,
      allowance: 50,
      renewsAt: null,
      cancelAt: null,
    },
  ],
  slots: [],
  freeRenewsAt: null,
  hasCustomer: false,
};

function mockBillingRpc(t: TestContext, response: unknown) {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://billing.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
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
    async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.equal(
        String(input),
        "https://billing.invalid/rest/v1/rpc/workspace_billing_summary_v2"
      );
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_workspace: workspaceId,
      });
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      });
    }
  );
}

test("billing RPC preserves slot balances and removes the diagnostic workspace total", async (t) => {
  const request = mockBillingRpc(t, { ...summary, balance: 100 });
  const { getBillingSummary } = await import("./store");
  assert.deepEqual(await getBillingSummary(workspaceId), summary);
  assert.equal(request.mock.callCount(), 1);
});

test("billing RPC rejects older or malformed summaries with a recoverable billing error", async (t) => {
  for (const [index, response] of [
    null,
    { ...summary, creditSlots: undefined, balance: 50 },
    { ...summary, creditSlots: null },
    { ...summary, creditSlots: {} },
    { ...summary, creditSlots: "invalid" },
    { ...summary, slots: undefined },
    { ...summary, slots: null },
  ].entries()) {
    await t.test(`invalid response ${index + 1}`, async (child) => {
      mockBillingRpc(child, response);
      const { getBillingSummary } = await import("./store");
      await assert.rejects(
        getBillingSummary(workspaceId),
        (error: unknown) =>
          error instanceof WorkspaceBillingError &&
          error.code === "billing_unavailable" &&
          error.status === 503
      );
    });
  }
});

test("billing RPC accepts explicitly empty slot arrays", async (t) => {
  const empty = { ...summary, model: "scale", creditSlots: [] };
  mockBillingRpc(t, empty);
  const { getBillingSummary } = await import("./store");
  assert.deepEqual(await getBillingSummary(workspaceId), empty);
});
