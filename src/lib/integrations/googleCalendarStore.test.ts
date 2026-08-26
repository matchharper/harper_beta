import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  createGoogleCalendarStore,
  type CalendarIntegrationRow,
} from "./googleCalendarStore";

test("all row queries filter by employee/provider and mutations compare the observed revision", async () => {
  const requests: Array<{
    url: URL;
    method: string;
    body: Record<string, unknown> | undefined;
  }> = [];
  const row: CalendarIntegrationRow = {
    company_user_id: "alice",
    provider: "google_calendar",
    composio_connected_account_id: "ca_alice",
    status: "active",
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z",
  };
  const admin = createClient<Database>(
    "https://test.supabase.co",
    "test-only-service-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const method = init?.method ?? "GET";
          requests.push({
            url: new URL(String(input)),
            method,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          });
          return Response.json(
            method === "DELETE"
              ? [{ company_user_id: "alice" }]
              : method === "POST"
                ? row
                : [row]
          );
        },
      },
    }
  );
  const store = createGoogleCalendarStore(admin);
  await store.find("alice");
  await store.insert("alice", "ca_alice");
  await store.setStatus(row, "disabled");
  await store.remove(row);
  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.equal(request.url.pathname, "/rest/v1/company_user_integrations");
    if (request.method === "POST") {
      assert.equal(request.body?.company_user_id, "alice");
      assert.equal(request.body?.provider, "google_calendar");
      assert.equal(request.body?.status, "active");
    } else {
      assert.equal(request.url.searchParams.get("company_user_id"), "eq.alice");
      assert.equal(
        request.url.searchParams.get("provider"),
        "eq.google_calendar"
      );
    }
    if (request.method === "PATCH" || request.method === "DELETE") {
      assert.equal(
        request.url.searchParams.get("composio_connected_account_id"),
        "eq.ca_alice"
      );
      assert.equal(request.url.searchParams.get("status"), "eq.active");
      assert.equal(
        request.url.searchParams.get("updated_at"),
        `eq.${row.updated_at}`
      );
    }
  }
  assert.equal(requests[2].body?.status, "disabled");
  assert.ok(
    Date.parse(String(requests[2].body?.updated_at)) >
      Date.parse(row.updated_at)
  );
});
