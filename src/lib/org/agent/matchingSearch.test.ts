import assert from "node:assert/strict";
import test from "node:test";
import { enqueueOrgMatchingSearch } from "@/lib/org/agent/matchingSearch";

test("membership rejection is a confirmed non-enqueue and never retried", async () => {
  let calls = 0;
  const result = await enqueueOrgMatchingSearch({
    admin: { rpc() {
      calls++;
      return Promise.resolve({ data: null, error: {
        code: "42501", message: "company_matching_search_workspace_forbidden",
        details: "private database diagnostic",
      } });
    } },
    roleId: "role-1", userId: "user-1", workspaceId: "workspace-1",
  });
  assert.deepEqual(result, { status: "not_queued", reason: "workspace_forbidden", startsAfterCurrentRun: false });
  assert.equal(calls, 1);
});

test("other database and transport failures preserve uncertainty", async () => {
  for (const error of [
    { code: "42501", message: "permission denied for unrelated operation" },
    { code: "08006", message: "company_matching_search_workspace_forbidden" },
    { code: "57014", message: "statement timeout" },
    new Error("Connection closed before response"),
  ]) {
    await assert.rejects(enqueueOrgMatchingSearch({
      admin: { rpc: () => Promise.resolve({ data: null, error }) },
      roleId: "role-1", userId: "user-1", workspaceId: "workspace-1",
    }), (caught) => caught === error);
  }
});

test("explicit current-Brief search calls the durable company queue once", async () => {
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const result = await enqueueOrgMatchingSearch({
    admin: {
      rpc(name, params) {
        calls.push({ name, params });
        return Promise.resolve({
          data: { startsAfterCurrentRun: false, status: "queued" },
          error: null,
        });
      },
    },
    roleId: "11111111-1111-4111-8111-111111111111",
    userId: "company-user-1",
    workspaceId: "workspace-1",
  });

  assert.deepEqual(calls, [
    {
      name: "enqueue_company_matching_search_v1",
      params: {
        p_company_user_id: "company-user-1",
        p_company_workspace_id: "workspace-1",
        p_role_id: "11111111-1111-4111-8111-111111111111",
      },
    },
  ]);
  assert.deepEqual(result, {
    reason: null,
    startsAfterCurrentRun: false,
    status: "queued",
  });
});

test("matching search queue rejects an unknown database outcome", async () => {
  await assert.rejects(
    enqueueOrgMatchingSearch({
      admin: {
        rpc() {
          return Promise.resolve({
            data: { status: "invented" },
            error: null,
          });
        },
      },
      roleId: "11111111-1111-4111-8111-111111111111",
      userId: "company-user-1",
      workspaceId: "workspace-1",
    }),
    /Unexpected company matching search enqueue result/
  );
});
