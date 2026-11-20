import assert from "node:assert/strict";
import test from "node:test";
import { executeReadCalendar, executeWriteCalendar } from "./tools";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

const userId = "00000000-0000-4000-8000-000000000001",
  conversationId = "00000000-0000-4000-8000-000000000002";
function fixture() {
  const operations: Record<string, any>[] = [];
  const integration = {
    talent_id: userId,
    provider: "google_calendar",
    status: "active",
    composio_connected_account_id: "ca_calendar",
    updated_at: "2026-11-14T00:00:00Z",
  };
  const admin = {
    rpc: async (name: string, args: Record<string, any>) => {
      assert.equal(name, "create_talent_external_operation");
      let row = operations.find(
        (row) => row.idempotency_key === args.p_idempotency_key
      );
      if (!row) {
        row = {
          id: crypto.randomUUID(),
          parent_id: null,
          user_id: userId,
          conversation_id: conversationId,
          kind: args.p_kind,
          idempotency_key: args.p_idempotency_key,
          request: args.p_request,
          status: "reserved",
          revision: 1,
          result: {},
          provider_refs: {},
          created_at: "2026-11-14T00:00:00Z",
          updated_at: "2026-11-14T00:00:00Z",
        };
        operations.push(row);
      }
      return { data: { ...row }, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, any> = {};
      let change: Record<string, any> | undefined;
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return chain;
        },
        update: (patch: Record<string, any>) => {
          change = patch;
          return chain;
        },
        maybeSingle: async () => {
          if (table === "talent_integrations") {
            assert.equal(filters.provider, "google_calendar");
            return { data: { ...integration }, error: null };
          }
          if (table === "talent_users")
            return { data: { deleted_at: null }, error: null };
          const row = operations.find((row) =>
            Object.entries(filters).every(([key, value]) => row[key] === value)
          );
          if (row && change) Object.assign(row, change);
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return chain;
    },
  } as unknown as TalentAdminClient;
  return { admin, operations, integration };
}
function accountResponse(owner = userId) {
  return Response.json({
    id: "ca_calendar",
    user_id: owner,
    toolkit: { slug: "googlecalendar" },
    auth_config: { id: "calendar-config" },
    status: "ACTIVE",
  });
}
const configure = () => {
  process.env.COMPOSIO_API_KEY = "fixture-key";
  process.env.COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID = "calendar-config";
};

test("an uncertain Calendar creation reconciles its exact effect without a second write", async (t) => {
  configure();
  const db = fixture();
  let writes = 0,
    event: Record<string, any> = {};
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/connected_accounts/ca_calendar"))
      return accountResponse();
    assert.ok(url.endsWith("/tools/execute/proxy"));
    const request = JSON.parse(String(init.body));
    if (request.method === "POST") {
      writes++;
      event = { ...request.body, etag: '"v1"' };
      assert.match(event.id, /^[a-f0-9]{64}$/);
      assert.match(request.endpoint, /sendUpdates=none/);
      throw new Error("Response lost after provider acceptance");
    }
    assert.equal(request.method, "GET");
    assert.ok(request.endpoint.endsWith(`/events/${event.id}`));
    return Response.json({ status: 200, data: event });
  });
  const context = {
    admin: db.admin,
    userId,
    conversationId,
    requestId: "create-one",
  };
  const input = {
    action: "create",
    effect_key: "interview-one",
    send_updates: "none",
    event: {
      summary: "Interview",
      start: { dateTime: "2026-11-16T10:00:00+09:00" },
      end: { dateTime: "2026-11-16T10:30:00+09:00" },
    },
  };
  const first = await executeWriteCalendar(input, context);
  assert.equal(first.status, "uncertain");
  assert.equal(
    (await executeWriteCalendar(input, context)).status,
    "uncertain"
  );
  assert.equal(writes, 1);
  const receipt = await executeReadCalendar(
    { action: "receipt", operation_id: db.operations[0].id },
    context
  );
  assert.equal(receipt.status, "succeeded");
  assert.equal(writes, 1);
  assert.equal(db.operations[0].result.event.id, event.id);
});
test("Calendar updates carry If-Match and preserve a concurrent provider conflict", async (t) => {
  configure();
  const db = fixture();
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    if (url.endsWith("/connected_accounts/ca_calendar"))
      return accountResponse();
    const request = JSON.parse(String(init.body));
    if (request.method === "GET")
      return Response.json({
        status: 200,
        data: { id: "event-one", etag: '"v1"' },
      });
    writes++;
    assert.equal(request.method, "PATCH");
    assert.deepEqual(request.parameters, [
      { name: "If-Match", value: '"v1"', type: "header" },
    ]);
    return Response.json({
      status: 412,
      data: { error: { message: "Precondition failed" } },
    });
  });
  const result = await executeWriteCalendar(
    {
      action: "update",
      effect_key: "reschedule-one",
      event_id: "event-one",
      etag: '"v1"',
      send_updates: "all",
      event: { summary: "Updated interview" },
    },
    { admin: db.admin, userId, conversationId, requestId: "update-one" }
  );
  assert.equal(result.status, "failed");
  assert.equal(writes, 1);
  assert.equal(db.operations[0].provider_refs.http_status, 412);
});
test("partial Calendar availability is not reported as complete and a foreign connection is refused", async (t) => {
  configure();
  const db = fixture();
  let proxy = 0;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("/connected_accounts/ca_calendar"))
      return accountResponse();
    proxy++;
    return Response.json({
      status: 200,
      data: { calendars: { primary: { errors: [{ reason: "notFound" }] } } },
    });
  });
  const result = await executeReadCalendar(
    {
      action: "busy",
      time_min: "2026-11-16T00:00:00Z",
      time_max: "2026-11-17T00:00:00Z",
    },
    { admin: db.admin, userId }
  );
  assert.equal(JSON.parse(result.modelOutput).complete, false);
  assert.equal(proxy, 1);
  db.integration.talent_id = "00000000-0000-4000-8000-000000000099";
  await assert.rejects(
    executeReadCalendar(
      { action: "list_calendars" },
      { admin: db.admin, userId }
    ),
    /본인의/
  );
  assert.equal(proxy, 1);
});
