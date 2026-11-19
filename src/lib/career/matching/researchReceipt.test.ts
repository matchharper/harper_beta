import assert from "node:assert/strict";
import test from "node:test";
import { recordSearchExecution, resolveSearchReceiptMatching } from "../resources/searchHistory";
import { CareerCapabilityRuntime } from "../capabilities/runtime";
import type { TalentToolExecutionContext } from "@/lib/talentOnboarding/tools";

test("a scoped page read checks the matching owner and stores just the source reference and actual count", async () => {
  const matchingId = "00000000-0000-4000-8000-000000000001";
  const other = "00000000-0000-4000-8000-000000000002";
  const writes: any[] = [];
  const admin = {
    from: (table: string) => {
      assert.equal(table, "talent_matchings");
      const filters: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: string) => { filters[key] = value; return query; },
        maybeSingle: async () => ({data: filters.id === matchingId && filters.talent_id === "owner" ? {id: matchingId} : null}),
      };
      return query;
    },
    rpc: async (name: string, args: unknown) => { assert.equal(name, "career_record_search_receipt_v1"); writes.push(args); return {error:null}; },
  };
  const context = { admin, userId:"owner", conversationId:"conversation", researchMatchingId:matchingId } as unknown as TalentToolExecutionContext;
  const input = { url: ["https://example.test/shared", "https://example.test/private"] };
  const target = await resolveSearchReceiptMatching("open_url", input, context);
  assert.equal(target, matchingId);
  await assert.rejects(resolveSearchReceiptMatching("open_url", {...input, matchingId:other}, context), /unavailable/);
  const result = { ok:true, status:"partial", pages:[{ok:true,sourceScope:"public",documentId:"doc",observationId:"rev",markdown:"private-sentinel"}, {ok:false}] };
  await recordSearchExecution("open_url",input,context,{result},target);
  const receipt = writes[0];
  assert.equal(receipt.p_request.matchingId, matchingId);
  assert.equal(receipt.p_result.count, 1);
  assert.equal(receipt.p_status, "partial");
  assert.deepEqual(receipt.p_request.sourceRefs, [{kind:"web_resource",id:"doc",revision:"rev"}]);
  assert.deepEqual(receipt.p_request.scope, {detail:"page",requested:2});
  assert.doesNotMatch(JSON.stringify(writes), /private-sentinel|example\.test/);
  await recordSearchExecution("open_url",input,{...context,researchMatchingId:undefined},{result});
  assert.equal(writes.length,1);
});

test("research still running can deliver its result to the original Career turn", async () => {
  const observed: any[] = [];
  const runtime = new CareerCapabilityRuntime({ mode:"full", eligibleTools:[], observePendingWork:async work => { observed.push(work); },
    promptArgs:() => ({ channel:"chat", isOnboardingDone:true, profile:null, structuredProfileText:"Synthetic profile", talentContextSection:"" }) });
  const dependency = {kind:"resource_operation", id:"research-1"};
  await runtime.recordResult("research_resources", {careerContinuation:dependency}, runtime.resolveStep(false));
  assert.deepEqual(observed,[dependency]);
  assert.equal(await runtime.shouldDeferToolCall(),false);
});
