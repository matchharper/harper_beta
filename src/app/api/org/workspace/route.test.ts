import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import type Stripe from "stripe";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const actorId = "00000000-0000-4000-8000-000000000002";

test("workspace DELETE authenticates, rechecks actual ownership, and fails closed on billing", async (t) => {
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://deletion.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
    STRIPE_SECRET_KEY: "",
    OPENAI_API_KEY: "unused-fixture-key",
  })) {
    const before = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
  let authority: string | null = "owner",
    rpcError: string | null = null;
  let rpcCalls = 0,
    invalidations = 0,
    customer: string | null = null;
  const nodeModule = Module as any,
    load = nodeModule._load;
  t.mock.method(
    nodeModule,
    "_load",
    function (this: unknown, name: string, ...args: unknown[]) {
      if (name === "server-only") return {};
      if (name === "next/cache")
        return {
          revalidateTag: () => {
            invalidations++;
          },
        };
      return load.call(this, name, ...args);
    }
  );
  t.mock.method(console, "error", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin,
        "https://deletion.invalid",
        "Never contact production"
      );
      const json = (value: unknown, status = 200) =>
        new Response(JSON.stringify(value), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      if (url.pathname === "/auth/v1/user")
        return json({
          id: actorId,
          email: "fixture@matchharper.com",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
        });
      if (url.pathname === "/rest/v1/company_user_workspace") {
        assert.equal(
          url.searchParams.get("company_workspace_id"),
          `eq.${workspaceId}`
        );
        assert.equal(url.searchParams.get("company_user_id"), `eq.${actorId}`);
        return json(authority ? [{ authority }] : []);
      }
      if (url.pathname === "/rest/v1/company_workspace")
        return json([
          {
            company_name: "Fixture",
            stripe_customer_id: customer,
            billing_checkout: null,
          },
        ]);
      if (url.pathname === "/rest/v1/rpc/delete_company_workspace_v1") {
        rpcCalls++;
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_workspace: workspaceId,
          p_actor: actorId,
          p_confirmation_name: "Fixture",
          p_stripe_customer: null,
          p_billing_checkout: null,
        });
        return rpcError
          ? json({ code: "P0001", message: rpcError }, 400)
          : new Response(null, { status: 204 });
      }
      assert.fail(`Unexpected request ${url.pathname}`);
    }
  );
  const { DELETE } = await import("./route");
  const remove = (
    body: unknown = {
      workspaceId,
      confirmationName: "Fixture",
      userId: "spoofed-owner",
    },
    auth = true
  ) =>
    DELETE(
      new NextRequest("https://harper.invalid/api/org/workspace", {
        method: "DELETE",
        headers: {
          ...(auth ? { Authorization: "Bearer deletion-fixture" } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    );
  assert.equal((await remove(undefined, false)).status, 401);
  assert.equal(
    (await remove({ workspaceId: "invalid", confirmationName: "Fixture" }))
      .status,
    400
  );
  for (const role of ["admin", "viewer", null]) {
    authority = role;
    assert.equal(
      (await remove()).status,
      403,
      "Internal email does not bypass ownership"
    );
  }
  authority = "owner";
  assert.equal(
    (await remove({ workspaceId, confirmationName: "Wrong" })).status,
    409
  );
  customer = "cus_fixture";
  assert.equal((await remove()).status, 503);
  assert.equal(rpcCalls, 0);
  customer = null;
  rpcError = "workspace_delete_owner_required";
  assert.equal(
    (await remove()).status,
    403,
    "Ownership changed after preflight"
  );
  assert.equal(invalidations, 0);
  rpcError = null;
  const result = await remove();
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, workspaceId });
  assert.equal(invalidations, 1);

  const { assertWorkspaceBillingEnded } =
    await import("@/lib/org/workspaceDeletion.server");
  await t.test(
    "checks every Stripe subscription and open checkout, including unsynchronized purchases",
    async () => {
      let statuses = ["canceled", "incomplete_expired"],
        sessionStatus = "expired",
        paymentStatus = "paid";
      const stripe = {
        subscriptions: {
          list: (args: unknown) => {
            assert.deepEqual(args, {
              customer: "cus_fixture",
              status: "all",
              limit: 100,
            });
            return (async function* () {
              for (const status of statuses) yield { status };
            })();
          },
        },
        checkout: {
          sessions: {
            retrieve: async () => ({
              status: sessionStatus,
              payment_status: paymentStatus,
            }),
          },
        },
      } as unknown as Pick<Stripe, "subscriptions" | "checkout">;
      const workspace = {
        company_name: "Fixture",
        stripe_customer_id: "cus_fixture",
        billing_checkout: { sessionId: "cs_fixture" },
      };
      await assertWorkspaceBillingEnded(workspace, stripe);
      for (const status of [
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "incomplete",
        "paused",
      ]) {
        statuses = [...Array<string>(100).fill("canceled"), status];
        await assert.rejects(
          assertWorkspaceBillingEnded(workspace, stripe),
          /workspace_delete_subscription_active/
        );
      }
      statuses = [];
      sessionStatus = "open";
      await assert.rejects(
        assertWorkspaceBillingEnded(workspace, stripe),
        /workspace_delete_billing_pending/
      );
      sessionStatus = "complete";
      paymentStatus = "unpaid";
      await assert.rejects(
        assertWorkspaceBillingEnded(workspace, stripe),
        /workspace_delete_billing_pending/
      );
      paymentStatus = "paid";
      await assertWorkspaceBillingEnded(workspace, stripe);
      await assert.rejects(
        assertWorkspaceBillingEnded(
          { ...workspace, billing_checkout: { expiresAt: "invalid" } },
          stripe
        ),
        /workspace_delete_billing_pending/
      );
      await assert.rejects(
        assertWorkspaceBillingEnded(
          { ...workspace, billing_checkout: {} },
          stripe
        ),
        /workspace_delete_billing_pending/
      );
    }
  );
});
