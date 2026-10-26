import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { NextRequest } from "next/server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
let POST: typeof import("./route").POST;
let reads = 0, dispatched = 0;
const receipts: Record<string, unknown>[] = [];
before(async () => {
  const module = Module as any, load = module._load;
  const admin = {
    from(table: string) {
      reads++;
      assert.equal(table, "company_user_workspace");
      const query = { select: () => query, eq: () => query, in: () => query,
        order: async () => ({data: [{company_user_id: "actor",authority: "owner"}],error: null}) };
      return query;
    },
    auth: {admin: {getUserById: async () => ({data: {user: {id: "actor"}},error: null})}},
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "enqueue_company_scheduled_matching_v1");
      receipts.push(args);
      return {data: {jobId: "root"},error: null};
    },
  };
  module._load = function (name: string, ...args: unknown[]) {
    if (name === "@/lib/server/candidateAccess") return {getSupabaseAdmin: () => admin};
    if (name === "@/lib/org/agent/store") return {ensureOrgRoleCreationConversation: async (args: any) => {
      assert.equal(args.roleId,roleId); assert.equal(args.workspaceId,workspaceId);
      return {conversation: {id: "conversation"}};
    }};
    if (name === "@/lib/org/agent/webActionTurn") return {dispatchOrgAgentWebActionJob: async (args: any) => {
      assert.equal(args.jobId,"root"); dispatched++;
    }};
    return load.call(this,name,...args);
  };
  try { ({POST} = await import("./route")); } finally { module._load = load; }
});

test("authorized scheduled searches use the current path regardless of the removed rollout flag", async () => {
  const previousSecret=process.env.INTERNAL_WORKER_API_SECRET;
  const previousFlag=process.env.COMPANY_SCHEDULED_AGENTIC_MATCHING;
  const request=(token="synthetic") => new NextRequest("https://example.invalid/api/internal/company-first/scheduled-review", {
    method: "POST", headers: {authorization: `Bearer ${token}`,"content-type": "application/json"},
    body: JSON.stringify({workspaceId,roleId,scheduledSlot: "2026-10-26T00:00:00Z"}),
  });
  try {
    process.env.INTERNAL_WORKER_API_SECRET="synthetic";
    for (const value of [undefined,"false","true"]) {
      if (value === undefined) delete process.env.COMPANY_SCHEDULED_AGENTIC_MATCHING;
      else process.env.COMPANY_SCHEDULED_AGENTIC_MATCHING=value;
      const response=await POST(request());
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{jobId: "root"});
    }
    assert.equal(dispatched,3);
    assert.equal(receipts.length,3);
    assert.ok(receipts.every(row => row.p_workspace===workspaceId && row.p_role===roleId && row.p_activation_run===null));
    const beforeDenied=reads;
    assert.equal((await POST(request("invalid"))).status,401);
    delete process.env.INTERNAL_WORKER_API_SECRET;
    assert.equal((await POST(request())).status,401);
    assert.equal(reads,beforeDenied);
  } finally {
    if (previousSecret === undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET=previousSecret;
    if (previousFlag === undefined) delete process.env.COMPANY_SCHEDULED_AGENTIC_MATCHING;
    else process.env.COMPANY_SCHEDULED_AGENTIC_MATCHING=previousFlag;
  }
});
