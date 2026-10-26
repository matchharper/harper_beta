import assert from "node:assert/strict";
import test from "node:test";
import { enqueueOrgAgenticMatchingSearch, enqueueOrgMatchingSearch, enqueueOrgRecommendationPublication } from "@/lib/org/agent/matchingSearch";

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

test("interactive search reports a confirmed authorization rejection without a retry", async () => {
  let calls = 0;
  const result = await enqueueOrgAgenticMatchingSearch({
    admin: { rpc: async () => {
      calls++;
      return { data: null, error: { code: "42501", message: "company_matching_search_workspace_forbidden", details: "private diagnostic" } };
    } } as any,
    roleId: "role", userId: "actor", workspaceId: "workspace", requestId: "call", input: {},
  });
  assert.equal(result.status, "not_queued");
  assert.equal(result.reason, "workspace_forbidden");
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(result).includes("private diagnostic"), false);
});

test("interactive search preserves uncertain database and transport failures", async () => {
  for (const error of [
    { code: "42501", message: "permission denied for unrelated operation" },
    { code: "08006", message: "company_matching_search_workspace_forbidden" },
    { code: "57014", message: "statement timeout" },
    new Error("Connection closed before response"),
  ]) {
    await assert.rejects(enqueueOrgAgenticMatchingSearch({
      admin: { rpc: async () => ({ data: null, error }) } as any,
      roleId: "role", userId: "actor", workspaceId: "workspace", requestId: "call", input: {},
    }), caught => caught === error);
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


test("interactive search saves evidence only and keeps the count as a suggestion", async () => {
  const calls: any[]=[];
  const admin = {rpc:async(name: string,params: unknown)=>{calls.push({name,params});return {data:{status:"queued",runId:"run",briefVersion:"v"},error:null};}} as any;
  const defaults = await enqueueOrgAgenticMatchingSearch({admin,roleId:"role",userId:"actor",workspaceId:"workspace",requestId:"call-1",input:{}});
  assert.equal(defaults.options.limit,5000); assert.equal(defaults.options.recommendCount,0);
  const requested = await enqueueOrgAgenticMatchingSearch({admin,roleId:"role",userId:"actor",workspaceId:"workspace",requestId:"call-2",sourceMessageId:42,input:{scope:"evaluated",startStage:2,limit:6000,recommendCount:25,sourceMessageId:99}});
  assert.equal(requested.options.recommendCount,0); assert.equal(requested.options.limit,6000); assert.equal(requested.options.recommendationTarget,25);
  assert.equal(calls[1].name,"enqueue_company_agentic_search_v1");
  assert.equal(calls[1].params.p_request_id,"call-2");
  assert.equal(calls[1].params.p_options.sourceMessageId,42);
});

test("invalid structural search commands are rejected before any effect", async () => {
  let calls=0;
  const admin={rpc:async()=>{calls++;throw Error("unexpected effect")}} as any;
  for(const input of [{startStage:"2"},{limit:0},{recommendCount:-1},{scope:"guess"},{talentIds:["invented"]}]) {
    await assert.rejects(enqueueOrgAgenticMatchingSearch({admin,roleId:"role",userId:"actor",workspaceId:"workspace",requestId:"call",input}));
  }
  assert.equal(calls,0);
});

test("publication preserves exact selections and an explicit empty list without any contact direction", async () => {
  const calls:any[]=[];
  const admin={rpc:async(name:string,params:any)=>{calls.push({name,params});return {data:{status:'queued'},error:null};}} as any;
  for(const talentIds of [[],['11111111-1111-4111-8111-111111111111']]) {
    await enqueueOrgRecommendationPublication({admin,roleId:'role',userId:'actor',workspaceId:'workspace',requestId:'call',sourceMessageId:12,
      input:{briefVersion:'current',poolVersion:'pool',talentIds}});
    const options=calls.at(-1).params.p_options;
    assert.deepEqual(options.talentIds,talentIds);
    assert.equal(options.recommendCount,talentIds.length);
    assert.equal(options.scope,'evaluated');
    assert.deepEqual(options.publication,{expectedBriefVersion:'current',expectedPoolVersion:'pool'});
    assert.equal(options.recommendCounts,undefined);
  }
  const count=calls.length;
  await assert.rejects(enqueueOrgRecommendationPublication({admin,roleId:'role',userId:'actor',workspaceId:'workspace',requestId:'call',sourceMessageId:12,input:{talentIds:[]}}));
  assert.equal(calls.length,count);
});


test("publication keeps an exact historical source without a search or contact command",async()=>{
  const calls:any[]=[];
  const admin={rpc:async(name:string,params:any)=>{calls.push({name,params});return {data:{status:'queued'},error:null};}} as any;
  const sourceRunId='11111111-1111-4111-8111-111111111111';
  const args={admin,roleId:'role',userId:'actor',workspaceId:'workspace',requestId:'call',sourceMessageId:12};
  await enqueueOrgRecommendationPublication({...args,input:{briefVersion:'current',poolVersion:'pool',talentIds:[],sourceRunId}});
  assert.equal(calls[0].params.p_options.publication.sourceRunId,sourceRunId);
  assert.equal(calls[0].params.p_options.scope,'evaluated');
  await assert.rejects(enqueueOrgRecommendationPublication({...args,input:{briefVersion:'current',poolVersion:'pool',talentIds:[],sourceRunId:'invalid'}}));
  assert.equal(calls.length,1);
});
