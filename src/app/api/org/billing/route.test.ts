import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

const workspaceId = "00000000-0000-4000-8000-000000000001";

test("billing routes enforce Owner-only financial access and paginate workspace usage", async (t) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_SUPABASE_URL: "https://billing.invalid",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-key",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-key",
    STRIPE_SECRET_KEY: "",
    OPENAI_API_KEY: "unused-billing-fixture-key",
  })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let authority: "owner" | "admin" | "viewer" | null = "owner";
  let usageRequests = 0;
  const summary = {
    workspaceId,
    model: "free",
    activeRoles: 0,
    capacity: null,
    slots: [],
    creditSlots: [],
    freeRenewsAt: null,
    hasCustomer: false,
  };
  const events = Array.from({ length: 45 }, (_, index) => ({
    id: `event-${index}`,
    action_code: "intro_request",
    created_at: "2026-10-07T12:00:00Z",
    delta: -1,
    period_id: "free-period",
    company_roles: { name: "Fixture Role" },
    company_workspace_credit_periods: { slot_id: null },
  }));
  t.mock.method(console, "error", () => {});
  t.mock.method(
    globalThis,
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin,
        "https://billing.invalid",
        "tests must never contact production"
      );
      const json = (value: unknown, headers: Record<string, string> = {}) =>
        new Response(JSON.stringify(value), {
          headers: { "Content-Type": "application/json", ...headers },
        });
      if (url.pathname === "/auth/v1/user")
        return json({
          id: "00000000-0000-4000-8000-000000000002",
          email: "billing-fixture@example.com",
          aud: "authenticated",
          app_metadata: {},
          user_metadata: {},
        });
      if (url.pathname === "/rest/v1/company_user_workspace") {
        assert.equal(
          url.searchParams.get("company_workspace_id"),
          `eq.${workspaceId}`
        );
        return json(authority ? [{ id: "membership", authority }] : []);
      }
      if (url.pathname === "/rest/v1/rpc/workspace_billing_summary_v2") {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          p_workspace: workspaceId,
        });
        return json(summary);
      }
      if (url.pathname === "/rest/v1/company_workspace")
        return json({
          company_workspace_id: workspaceId,
          company_name: "Fixture",
          stripe_customer_id: null,
        });
      if (url.pathname === "/rest/v1/company_workspace_credit_events") {
        usageRequests++;
        assert.equal(
          url.searchParams.get("company_workspace_id"),
          `eq.${workspaceId}`
        );
        assert.equal(url.searchParams.get("order"), "created_at.desc,id.desc");
        assert.equal(url.searchParams.get("limit"), "20");
        const offset = Number(url.searchParams.get("offset"));
        const rows = events.slice(offset, offset + 20);
        return json(rows, {
          "content-range": `${offset}-${offset + rows.length - 1}/45`,
        });
      }
      assert.fail(`Unexpected billing test request: ${url.pathname}`);
    }
  );
  // Next resolves this compile-time server marker; plain Node tests do not.
  const nodeModule = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const load = nodeModule._load;
  t.mock.method(
    nodeModule,
    "_load",
    function (
      this: typeof nodeModule,
      request: string,
      parent: unknown,
      isMain: boolean
    ) {
      return request === "server-only"
        ? {}
        : load.call(this, request, parent, isMain);
    }
  );
  const { GET, POST } = await import("./route");
  const get = (view: string, page?: string) =>
    GET(
      new NextRequest(
        `https://harper.invalid/api/org/billing?workspaceId=${workspaceId}&view=${view}${page === undefined ? "" : `&page=${page}`}`,
        { headers: { Authorization: "Bearer billing-route-fixture" } }
      )
    );
  const post = (action: string) =>
    POST(
      new NextRequest("https://harper.invalid/api/org/billing", {
        method: "POST",
        headers: {
          Authorization: "Bearer billing-route-fixture",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceId, action }),
      })
    );

  await t.test(
    "Admins cannot retrieve invoices or enter the billing portal",
    async () => {
      authority = "admin";
      for (const response of [await get("invoices"), await post("portal")]) {
        assert.equal(response.status, 403);
        assert.equal(
          (await response.json()).billingCode,
          "billing_owner_required"
        );
      }
    }
  );
  await t.test(
    "Viewers can read slots and usage but cannot perform mutations",
    async () => {
      authority = "viewer";
      const response = await get("summary");
      assert.equal(response.status, 200);
      assert.equal((await response.json()).summary.canManage, false);
      assert.equal((await get("usage", "0")).status, 200);
      assert.equal((await post("checkout")).status, 403);
    }
  );
  await t.test("Owners can retrieve billing documents", async () => {
    authority = "owner";
    const response = await get("invoices");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { invoices: [], hasMore: false });
  });
  await t.test(
    "45 events yield 20, 20 and 5 rows, with stable page boundaries",
    async () => {
      authority = "admin";
      const ids: string[] = [];
      for (const page of [0, 1, 2]) {
        const response = await get("usage", String(page));
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.page, page);
        assert.equal(result.total, 45);
        assert.equal(result.usage.length, page === 2 ? 5 : 20);
        assert.equal(result.hasMore, page < 2);
        assert.equal(result.usage[0].slotLabel, "Shared credits");
        ids.push(...result.usage.map((row: { id: string }) => row.id));
      }
      assert.equal(new Set(ids).size, 45);
    }
  );
  await t.test(
    "invalid pages and unrelated workspaces never reach usage queries",
    async () => {
      const before = usageRequests;
      for (const page of ["-1", "1.5", "NaN", "100001"])
        assert.equal((await get("usage", page)).status, 400);
      assert.equal((await get("unknown")).status, 400);
      authority = null;
      assert.equal((await get("usage", "0")).status, 403);
      assert.equal(usageRequests, before);
    }
  );
});
