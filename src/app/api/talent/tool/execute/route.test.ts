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
  class ToolFailure extends Error { status = 409; }
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { id: "fixture" }, error: null }) };
  modules._load = function(request, ...rest) {
    if (request === "@/lib/supabaseServer") return { getRequestUser: async () => ({ id: "fixture-user" }) };
    if (request === "@/lib/talentOnboarding/server") return { getTalentSupabaseAdmin: () => ({ from: () => chain }) };
    if (request === "@/lib/career/mockInterview") return { MockInterviewRequestError: ToolFailure, readMockInterviewOpportunityId: () => null };
    if (request === "@/lib/talentOnboarding/tools") return { TalentToolError: ToolFailure, executeTalentTool: async () => {
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
    const delivered = JSON.parse(body.modelOutput);
    assert.equal(delivered.assistantInstruction, "기존 안내 그대로");
    assert.equal(delivered.answerDraft, "원문 그대로");
    assert.match(delivered.additionalToolDiagnostics, /futureField/);
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
