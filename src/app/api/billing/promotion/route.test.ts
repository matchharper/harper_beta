import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";
import { buildPromotionToken, readPromotion, PROMOTION_COOKIE, PROMOTION_END } from "@/lib/org/billing/promotion";
import { GET } from "./route";

test("promotion entry retains a signed offer through login without granting workspace access", async (t) => {
  t.mock.method(Date, "now", () => PROMOTION_END - 86400000);
  const before = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-key";
  t.after(() => { if (before === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = before; });
  const token = buildPromotionToken("fixture");
  assert.equal(PROMOTION_END, Date.parse("2026-11-06T00:00:00+09:00"));
  assert.equal(readPromotion(token, Date.parse("2026-11-05T00:00:00+09:00"))?.endsOn, "2026-11-05");
  assert.ok(readPromotion(token, PROMOTION_END - 1));
  assert.throws(() => readPromotion(token, PROMOTION_END));
  const response = await GET(new NextRequest(`https://harper.invalid/api/billing/promotion?token=${token}`));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://harper.invalid/org/slots?purchase=slot&interval=month&lang=ko");
  const cookie = response.cookies.get(PROMOTION_COOKIE)!;
  assert.equal(cookie.value, token);
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.ok(cookie.expires instanceof Date);
  assert.equal(cookie.expires.getTime(), PROMOTION_END);
  assert.equal((await GET(new NextRequest(`https://harper.invalid/api/billing/promotion?token=${token}x`))).status, 410);
});

test("authenticated checkout forwards the cookie and displayed unit price to the payment executor", async (t) => {
  const mod = Module as unknown as { _load: (id: string, parent: unknown, main: boolean) => unknown };
  const original = mod._load;
  let received: unknown[] = [];
  t.mock.method(mod, "_load", function(this: typeof mod, id: string, parent: unknown, main: boolean) {
    if (id === "server-only") return {};
    if (id.endsWith("/candidateAccess")) return { getSupabaseAdmin: () => ({}), requireAuthenticatedUser: async () => ({ id: "fixture-user", email: "test@example.invalid" }) };
    if (id.endsWith("/org/server")) return { assertOrgWorkspacePermission: async () => "owner", OrgHttpError: class extends Error {} };
    if (id.endsWith("/billing/store")) return {};
    if (id.endsWith("/billing/activity.server")) return { scheduleBillingActivity: () => {} };
    if (id.endsWith("/billing/service")) return { createSlotCheckout: async (...args: unknown[]) => { received = args; return { url: "https://checkout.stripe.com/synthetic" }; } };
    return original.call(this, id, parent, main);
  });
  const { POST } = await import("../../org/billing/route");
  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const response = await POST(new NextRequest("https://harper.invalid/api/org/billing", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: `${PROMOTION_COOKIE}=signed-fixture` },
    body: JSON.stringify({ workspaceId, action: "checkout", interval: "month", quantity: 2, locale: "ko", expectedUnitAmount: 19900 }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(received, [workspaceId, "fixture-user", "test@example.invalid", "ko", "month", 2, { token: "signed-fixture", expectedUnitAmount: 19900 }]);
});
