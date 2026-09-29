import assert from "node:assert/strict";
import test from "node:test";
import { enqueueOrgMatchingSearch } from "@/lib/org/agent/matchingSearch";

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
