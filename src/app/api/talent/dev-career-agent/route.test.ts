import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { NextRequest } from "next/server";

test("manual background invocation verifies ownership and retries the same durable handoff", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const originalLoad = modules._load;
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const conversationId = "00000000-0000-4000-8000-000000000002";
  const requestId = "00000000-0000-4000-8000-000000000003";
  let user: { id: string; email: string } | null = {
    id: ownerId,
    email: "developer@example.invalid",
  };
  let allowed = true;
  let failPublish = true;
  const rows = new Map<string, any>();
  const handoffs: string[] = [];
  const logs = Array.from({ length: 105 }, (_, index) => ({
    id: index + 1,
    user_id: ownerId,
    type: "career_background_tool",
    meta_data: {
      runId: requestId,
      executionId: `tool-${index}`,
      name: "read_matching",
      phase: "started",
      occurredAt: "2026-11-02T00:00:00Z",
      inputText: "{}",
    },
  }));
  logs.push({ ...logs[0], id: 106, user_id: "another-user" });
  logs.push({
    ...logs[0],
    id: 107,
    meta_data: { ...logs[0].meta_data, runId: "another-run" },
  });
  const admin = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let after = 0,
        limit = Infinity;
      const query: any = {
        select: () => query,
        order: () => query,
        gt: (_key: string, value: number) => {
          after = value;
          return query;
        },
        limit: (value: number) => {
          limit = value;
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve({
            data: logs
              .filter(
                (row) =>
                  row.id > after &&
                  filters.every(
                    ([key, value]) =>
                      key
                        .split("->>")
                        .reduce(
                          (current: any, field) => current?.[field],
                          row
                        ) === value
                  )
              )
              .slice(0, limit),
            error: null,
          }).then(resolve, reject),
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        upsert: async (row: any, options: any) => {
          assert.equal(table, "opportunity_discovery_run");
          assert.deepEqual(options, {
            onConflict: "id",
            ignoreDuplicates: true,
          });
          if (!rows.has(row.id)) rows.set(row.id, structuredClone(row));
          return { error: null };
        },
        maybeSingle: async () => {
          const candidates =
            table === "talent_conversations"
              ? [{ id: conversationId, user_id: ownerId }]
              : [...rows.values()];
          const data = candidates.find((row) =>
            filters.every(
              ([key, value]) =>
                key
                  .split("->>")
                  .reduce((current, field) => current?.[field], row) === value
            )
          );
          return { data: data ?? null, error: null };
        },
      };
      return query;
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/internalAccess": { canUseCareerDevControls: () => allowed },
    "@/lib/talentOnboarding/admin": { getTalentSupabaseAdmin: () => admin },
    "@/lib/career/background/server": {
      acceptCareerBackgroundRun: async (args: any) => {
        assert.equal(args.admin, admin);
        const row = rows.get(args.discoveryRunId);
        if (row.status === "running") {
          assert.equal(args.leaseToken, row.lease_token);
          row.status = "handed_off";
          row.lease_token = null;
          row.trigger_payload.agentInvocation = {
            replyId: `background:${row.id}`,
          };
        }
        if (failPublish) {
          failPublish = false;
          throw new Error("Queue acknowledgement lost");
        }
        handoffs.push(row.id);
        return { discoveryRunId: row.id, status: row.status };
      },
    },
  };
  modules._load = function (request: string, ...args: any[]) {
    return mocks[request] ?? originalLoad.call(this, request, ...args);
  };
  try {
    const { POST, GET } = await import("./route");
    const read = (after = "0", token = "test-token") =>
      GET(
        new NextRequest(
          `http://localhost/api/talent/dev-career-agent?runId=${requestId}&after=${after}`,
          {
            headers: token ? { authorization: `Bearer ${token}` } : {},
          }
        )
      );
    const call = (
      body: unknown = { conversationId, requestId },
      token = "test-token"
    ) =>
      POST(
        new NextRequest("http://localhost/api/talent/dev-career-agent", {
          method: "POST",
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: JSON.stringify(body),
        })
      );
    assert.equal((await call(undefined, "")).status, 401);
    assert.equal((await read("0", "")).status, 401);
    user = null;
    assert.equal((await call()).status, 401);
    user = { id: ownerId, email: "developer@example.invalid" };
    allowed = false;
    assert.equal((await call()).status, 403);
    assert.equal((await read()).status, 403);
    allowed = true;
    assert.equal(
      (await call({ conversationId, requestId: "invalid" })).status,
      400
    );
    user = { ...user, id: "another-user" };
    assert.equal((await call()).status, 404);
    assert.equal(rows.size, 0);
    user = { ...user, id: ownerId };

    assert.equal(
      (
        await call({
          conversationId,
          requestId,
          talentId: "another-user",
          triggerPayload: { companyRequestFollowups: ["forged"] },
        })
      ).status,
      500
    );
    const prepared = structuredClone(rows.get(requestId));
    assert.equal(prepared.talent_id, ownerId);
    assert.equal(prepared.trigger_payload.runContract, "career_agent_v1");
    assert.equal(prepared.trigger_payload.companyRequestFollowups, undefined);
    assert.equal(prepared.status, "handed_off");
    const retry = await call();
    assert.equal(retry.status, 202);
    assert.deepEqual(await retry.json(), {
      runId: requestId,
      status: "handed_off",
    });
    assert.equal(rows.size, 1);
    assert.deepEqual(
      rows.get(requestId),
      prepared,
      "retry must not overwrite the accepted invocation"
    );
    assert.deepEqual(handoffs, [requestId]);
    const first = await read();
    assert.equal(first.headers.get("cache-control"), "private, no-store");
    const firstPage = await first.json();
    assert.equal(firstPage.logs.length, 100);
    assert.equal(firstPage.hasMore, true);
    const lastPage = await (await read(String(firstPage.nextCursor))).json();
    assert.deepEqual(
      lastPage.logs.map((row: any) => row.id),
      [101, 102, 103, 104, 105]
    );
    assert.equal(lastPage.hasMore, false);
    assert.equal((await read("-1")).status, 400);
    user = { ...user!, id: "another-user" };
    assert.equal((await read()).status, 404);
    user = { ...user, id: ownerId };

    rows.get(requestId).trigger_payload.createdBy = "another_source";
    assert.equal((await call()).status, 404);
    assert.equal((await read()).status, 404);
    assert.equal(
      handoffs.length,
      1,
      "cannot hand off another source's existing run"
    );
  } finally {
    modules._load = originalLoad;
  }
});
