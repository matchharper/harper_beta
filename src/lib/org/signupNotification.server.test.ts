import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { createClient } from "@supabase/supabase-js";

test("signup alert claims once and preserves the receipt; unconfirmed deliveries are not retried", async context => {
  const nodeModule = Module as unknown as { _load: (request: string, parent: unknown, isMain: boolean) => unknown };
  const originalLoad = nodeModule._load;
  context.mock.method(nodeModule, "_load", function (this: typeof nodeModule, request: string, parent: unknown, isMain: boolean) {
    if (request === "@/lib/server/candidateAccess") return {
      getSupabaseAdmin: () => { throw new Error("Test must supply its isolated database client"); },
    };
    return originalLoad.call(this, request, parent, isMain);
  });
  const { deliverWorkspaceSignupNotification } = await import("./signupNotification.server");
  const previous = process.env.SLACK_COMPANY_NOTIFICATION_TOKEN;
  process.env.SLACK_COMPANY_NOTIFICATION_TOKEN = "https://fixture.invalid/webhook";
  try {
    for (const outcome of ["ok", "timeout", "rate-limit"] as const) {
      let status = "pending";
      let sends = 0;
      let saved: any;
      const notice = {
        workspaceId: "fixture-workspace", companyName: "<!channel>",
        email: "owner@agency.example", emailDomain: "agency.example",
        reviewDomain: "agency.example", isReviewing: true,
        claimedAt: "2026-10-20T00:00:00Z",
      };
      const admin = createClient("https://fixture.invalid", "fixture", {
        global: { fetch: async (url, options) => {
          let result = null;
          if (String(url).includes("/rpc/")) {
            if (status === "pending") { status = "sending"; result = { ...notice, status }; }
          } else {
            saved = JSON.parse(String(options?.body)).signup_notification;
            status = saved.status;
          }
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        } },
      }) as any;
      const send: typeof fetch = async (_url, options) => {
        sends++;
        assert.ok(String(options?.body).includes("&lt;!channel&gt;"));
        if (outcome === "timeout") throw new Error("timeout");
        return new Response(outcome === "ok" ? "ok" : "rate_limited", { status: outcome === "ok" ? 200 : 429 });
      };
      const actual = await deliverWorkspaceSignupNotification(notice.workspaceId, { admin, fetch: send });
      assert.equal(actual, outcome === "ok" ? "sent" : outcome === "timeout" ? "uncertain" : "pending");
      if (outcome !== "rate-limit") {
        assert.equal(await deliverWorkspaceSignupNotification(notice.workspaceId, { admin, fetch: send }), "skipped");
        assert.equal(sends, 1);
      } else assert.ok(saved.retryAt);
    }
  } finally {
    if (previous === undefined) delete process.env.SLACK_COMPANY_NOTIFICATION_TOKEN;
    else process.env.SLACK_COMPANY_NOTIFICATION_TOKEN = previous;
  }
});
