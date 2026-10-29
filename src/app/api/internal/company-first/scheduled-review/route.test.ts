import assert from "node:assert/strict";
import Module from "node:module";
import { before, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const roleId = "20000000-0000-4000-8000-000000000001";
let POST: typeof import("./route").POST;
let reads = 0, dispatched = 0;
let rpcResult: Record<string, unknown> = {jobId: "root"};
let actors = [{company_user_id: "actor",authority: "owner"}];
let actorReadError: unknown = null;
let rpcError: {message:string;code?:string}|null = null;
let priorJob: {id:string}|null = null;
const activationRunId="30000000-0000-4000-8000-000000000001";
const receipts: Record<string, unknown>[] = [];
before(async () => {
  const module = Module as any, load = module._load;
  const admin = {
    from(table: string) {
      reads++;
      if(table==="company_agent_web_action_jobs") {
        const filters:Record<string,unknown>={};
        const query={select:()=>query,eq:(key:string,value:unknown)=>{filters[key]=value;return query;},
          maybeSingle:async()=>{
            assert.deepEqual(filters,{company_workspace_id:workspaceId,role_id:roleId,
              idempotency_key:`role-activation-matching:${activationRunId}`});
            return {data:priorJob,error:null};
          }};
        return query;
      }
      assert.equal(table, "company_user_workspace");
      const query = { select: () => query, eq: () => query, in: () => query,
        order: async () => ({data: actors,error: actorReadError}) };
      return query;
    },
    auth: {admin: {getUserById: async () => ({data: {user: {id: "actor"}},error: null})}},
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "enqueue_company_scheduled_matching_v1");
      receipts.push(args);
      return {data: rpcResult,error: rpcError};
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

beforeEach(() => {
  actors=[{company_user_id:"actor",authority:"owner"}];
  actorReadError=null;rpcError=null;rpcResult={jobId:"root"};priorJob=null;
  reads=0;dispatched=0;receipts.length=0;
});

test("missing execution actor is a confirmed rejection without enqueue or dispatch", async () => {
  actors=[];
  const prior=process.env.INTERNAL_WORKER_API_SECRET;
  process.env.INTERNAL_WORKER_API_SECRET="synthetic";
  try {
    const response=await POST(new NextRequest("https://example.invalid/api/internal/company-first/scheduled-review", {
      method:"POST",headers:{authorization:"Bearer synthetic"},
      body:JSON.stringify({workspaceId,roleId,activationRunId,scheduledSlot:"2026-10-26T00:00:00Z"}),
    }));
    assert.equal(response.status,409);
    assert.equal((await response.json()).code,"scheduled_actor_missing");
    assert.equal(receipts.length,0);assert.equal(dispatched,0);
  } finally {
    if(prior===undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET=prior;
  }
});

test("lost response followed by actor removal preserves the existing activation job",async()=>{
  actors=[];priorJob={id:"existing-root"};
  const prior=process.env.INTERNAL_WORKER_API_SECRET;
  process.env.INTERNAL_WORKER_API_SECRET="synthetic";
  try {
    const response=await POST(new NextRequest("https://example.invalid/api/internal/company-first/scheduled-review",{
      method:"POST",headers:{authorization:"Bearer synthetic"},
      body:JSON.stringify({workspaceId,roleId,activationRunId,scheduledSlot:"2026-10-26T00:00:00Z"}),
    }));
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{status:"already_queued",jobId:"existing-root"});
    assert.equal(receipts.length,0);assert.equal(dispatched,0);
  } finally {
    if(prior===undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET=prior;
  }
});

for(const code of ["scheduled_role_unavailable","scheduled_actor_forbidden","invalid_role_activation","database unavailable"]) {
  test(`enqueue rejection distinguishes ${code} from a retryable infrastructure error`, async () => {
    rpcError={message:code};
    const prior=process.env.INTERNAL_WORKER_API_SECRET;
    process.env.INTERNAL_WORKER_API_SECRET="synthetic";
    try {
      const response=await POST(new NextRequest("https://example.invalid/api/internal/company-first/scheduled-review", {
        method:"POST",headers:{authorization:"Bearer synthetic"},
        body:JSON.stringify({workspaceId,roleId,scheduledSlot:"2026-10-26T00:00:00Z"}),
      }));
      const body=await response.json();
      assert.equal(response.status,code==="database unavailable"?500:409);
      assert.equal(body.retryable,code==="database unavailable"?undefined:false);
      if(response.status===409) assert.equal(body.code,code);
      assert.equal(dispatched,0);
    } finally {
      if(prior===undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
      else process.env.INTERNAL_WORKER_API_SECRET=prior;
    }
  });
}

test("a failed actor lookup is not interpreted as an absent actor",async()=>{
  actorReadError=new Error("database timeout");actors=[];
  const prior=process.env.INTERNAL_WORKER_API_SECRET;
  process.env.INTERNAL_WORKER_API_SECRET="synthetic";
  try {
    const response=await POST(new NextRequest("https://example.invalid/api/internal/company-first/scheduled-review",{
      method:"POST",headers:{authorization:"Bearer synthetic"},
      body:JSON.stringify({workspaceId,roleId,scheduledSlot:"2026-10-26T00:00:00Z"}),
    }));
    assert.equal(response.status,500);
    assert.equal((await response.json()).retryable,undefined);
    assert.equal(receipts.length,0);
  } finally {
    if(prior===undefined) delete process.env.INTERNAL_WORKER_API_SECRET;
    else process.env.INTERNAL_WORKER_API_SECRET=prior;
  }
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
    rpcResult={status:"skipped",reason:"hiring_brief_missing"};
    const skipped=await POST(request());
    assert.equal(skipped.status,200);
    assert.deepEqual(await skipped.json(),rpcResult);
    assert.equal(dispatched,3);
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
