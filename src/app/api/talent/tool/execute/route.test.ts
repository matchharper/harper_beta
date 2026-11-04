import assert from "node:assert/strict";
import test from "node:test";
import Module from "node:module";
import { reportToolDiagnostic } from "@/lib/llm/toolExecution";

// The actual endpoint and delivery helpers run; auth/DB/tool effects are isolated.
test("voice endpoint keeps original output and transports internal or unexpected diagnostics", async () => {
  const modules = Module as unknown as { _load: (...args: any[]) => any };
  const load = modules._load;
  let source: unknown = { ok: false, assistantInstruction: "기존 안내 그대로", answerDraft: "원문 그대로" };
  let throwValue = false;
  const executions:any[]=[];
  const voiceRequests:any[]=[];
  class ToolFailure extends Error { status = 409; }
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: "fixture" }, error: null }) };
  modules._load = function(request, ...rest) {
    if(request==='../realtimeInstructions') return {buildCareerRealtimeSessionInstructions:async()=>({})};
    if(request==='../llmTools') return {getCareerRealtimeToolCandidates:()=>[]};
    if (request === "@/lib/supabaseServer") return { getRequestUser: async () => ({ id: "fixture-user" }) };
    if (request === "@/lib/talentOnboarding/server") return { getTalentSupabaseAdmin: () => ({ from: () => chain, rpc:async(name:string,input:any)=>{assert.equal(name,'record_career_voice_tool_request_v1');voiceRequests.push(input);return {data:'voice-event',error:null};} }) };
    if (request === "@/lib/career/mockInterview") return { MockInterviewRequestError: ToolFailure, readMockInterviewOpportunityId: () => null };
    if (request === "@/lib/talentOnboarding/tools") return { TalentToolError: ToolFailure, executeTalentTool: async (args:any) => {
      executions.push(args);
      if (throwValue) throw source;
      reportToolDiagnostic({ message: "socket closed", futureField: [2, 4] });
      return source;
    } };
    return load.call(this, request, ...rest);
  };
  try {
    const { POST } = await import("./route");
    const request = () => new Request("http://localhost/api/talent/tool/execute", { method: "POST", body: JSON.stringify({ channel: "voice", conversationId: "fixture", name: "read_document" }) });
    const reply = await POST(request() as any);
    const body = await reply.json();
    assert.deepEqual(body.output, source);
    assert.match(body.modelOutput, /기존 안내 그대로/);
    assert.match(body.modelOutput, /원문 그대로/);
    assert.match(body.modelOutput, /futureField/);
    source = { ok: true, activityMessage: { payload: "UI-only" }, modelOutput: JSON.stringify({ ok: true, currentActivity: { revision: 2 } }) };
    const compactBody = await (await POST(request() as any)).json();
    assert.deepEqual(compactBody.output, source);
    assert.match(compactBody.modelOutput,/currentActivity[\s\S]*revision[\s\S]*2/);
    assert.doesNotMatch(compactBody.modelOutput,/activityMessage|UI-only/);
    assert.match(compactBody.modelOutput, /futureField/);
    const introduced=await POST(new Request('http://localhost/api/talent/tool/execute',{method:'POST',body:JSON.stringify({channel:'voice',conversationId:'fixture',name:'contact_company',toolCallId:'call-123',arguments:{recommendationId:'rec',acceptIntroduction:true}})}) as any);
    assert.equal(introduced.status,200);
    assert.equal(voiceRequests[0].p_talent,'fixture-user');
    assert.equal(voiceRequests[0].p_call,'call-123');
    assert.equal(executions.at(-1).context.voiceEventId,'voice-event');
    assert.equal(executions.at(-1).context.userMessageId,undefined);
    source = { ok: false, error: { message: "failed", apiKey: "must-not-leak" }, answerDraft: "원문 그대로" };
    const protectedReply = await POST(request() as any);
    const protectedBody = await protectedReply.text();
    assert.ok(!protectedBody.includes("must-not-leak"));
    assert.equal((source as any).error.apiKey, "must-not-leak");
    source = { message: "unexpected SDK failure", customDiagnostics: [7] }; throwValue = true;
    const failed = await POST(request() as any); assert.equal(failed.status, 500);
    const failure = await failed.json(); assert.match(failure.error, /customDiagnostics/);
    assert.ok(!failure.error.includes("[object Object]"));
  } finally { modules._load = load; }
});
