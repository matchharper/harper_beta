import assert from "node:assert/strict";
import test from "node:test";
import { runOrgAgentToolLoop, type OrgAgentLoopDependencies } from "./chat";
import { ORG_AGENT_GEMINI_FLASH_MODEL } from "./modelConfig";
import { buildCompanyIntroTalentRead } from "./data";
import { companyCompletionTokenBudget, validateCompanyCompletion } from "./completionContract";
import { executeOrgAgentTool } from "./toolExecution";
import { createOrgAgentToolExecutionState } from "./toolState";
import { getEnabledOrgAgentTools } from "./tools";
import { createEvaluationReadAdmin } from "../../../../scripts/lib/companyAgentEvaluationContract";

function fixture() {
  return {
    actorId: "actor", actorLabel: "팀원", currentUserMessageId: 1,
    admin: new Proxy({}, { get() { throw Error("Unexpected DB access"); } }),
    conversation: { id: "conversation", role_id: null, company_workspace_id: "workspace" },
    context: { workspace: { workspaceId: "workspace" }, roles: [], companyText: "합성 회사", rolesText: "-", conversationText: "-", conversationMessages: [], summariesText: "-", recentContactsText: "-", recentRecommendationsText: "-", contextNotesText: "-", completeRoleRequestIds: [], defaultLongTextObservations: [], inProgressRoleCreationsText: "-", pendingUpdateText: "-", recentToolContextText: "-" },
    mentions: [], model: ORG_AGENT_GEMINI_FLASH_MODEL, readAudience: "company_safe",
    scopeKey: "test", source: "slack", slackThreadId: null, user: { id: "actor" },
    userMessage: "후보자에게 물어봐줘",
  } as unknown as Parameters<typeof runOrgAgentToolLoop>[0];
}
const call = (id: string, name: string, input: unknown) => ({ id, type: "function", function: { name, arguments: JSON.stringify(input) } });
const response = (tools: unknown[], extra = {}) => ({ model: ORG_AGENT_GEMINI_FLASH_MODEL, response: { provider: "Google", choices: [{ finish_reason: tools.length ? "tool_calls" : "stop", message: { role: "assistant", content: tools.length ? null : "완료", tool_calls: tools, ...extra } }] } });
const authorizedRoleReads = () => createEvaluationReadAdmin({
  company_user_workspace: [{ company_user_id: "actor", company_workspace_id: "workspace", authority: "owner", access_scope: "organization", team_id: null }],
  company_roles: [{ role_id: "role", company_workspace_id: "workspace", source_type: "internal", company_internal_roles: { team_id: null }, information: { testOnly: true, testFixture: "company-loop-unit" } }],
});

test("a scheduled full turn has every supported schema, permits silence and does not alter the next turn's capability mode", async () => {
  const previous = process.env.ORG_AGENT_CAPABILITY_MODE;
  process.env.ORG_AGENT_CAPABILITY_MODE = "progressive";
  try {
    const result = await runOrgAgentToolLoop({ ...fixture(), capabilityMode: "full", backgroundOrigin: "scheduled_review", allowSilentCompletion: true }, {
      complete: async (args) => {
        assert.deepEqual(args.tools!.map(tool => tool.function.name).sort(), getEnabledOrgAgentTools("slack").map(tool => tool.function.name).sort());
        assert.ok(String(args.messages[0].content).includes("proactively reaching out"));
        assert.ok(!String(args.messages[0].content).includes("This turn was awakened by a verified product event"));
        return response([], { content: "" });
      },
      executeTool: async () => { throw Error("No external action selected"); },
    });
    assert.equal(result.reply, "");
    await runOrgAgentToolLoop(fixture(), { complete: async (args) => {
      assert.ok(args.tools!.some(tool => tool.function.name === "load_capabilities"));
      assert.ok(!args.tools!.some(tool => tool.function.name === "update_data"));
      return response([]);
    } });
    assert.equal(process.env.ORG_AGENT_CAPABILITY_MODE, "progressive");
  } finally {
    if (previous === undefined) delete process.env.ORG_AGENT_CAPABILITY_MODE;
    else process.env.ORG_AGENT_CAPABILITY_MODE = previous;
  }
});

test("turn cancellation is passed to the real tool boundary", async () => {
  const controller = new AbortController();
  let step = 0;
  await assert.rejects(runOrgAgentToolLoop({ ...fixture(), signal: controller.signal }, {
    complete: async () => step++ === 0 ? response([call("read", "get_talents", {})]) : response([]),
    executeTool: async (args) => {
      assert.equal(args.signal, controller.signal);
      controller.abort(new Error("Stopped by user"));
      args.signal!.throwIfAborted();
      return {};
    },
  }), /Stopped by user/);
});

test("production loop gates by offered snapshot, then loads policy/schema together; preserves signatures", async () => {
  process.env.ORG_AGENT_CAPABILITY_MODE = "progressive";
  const signature = [{ type: "reasoning.encrypted", data: "opaque-test-signature", id: "signed-call" }];
  let step = 0;
  const executed: string[] = [];
  const complete: NonNullable<OrgAgentLoopDependencies["complete"]> = async (args) => {
    const names = args.tools!.map((t) => t.function.name);
    if (step++ === 0) {
      assert.ok(!names.includes("update_data"));
      assert.ok(!String(args.messages[0].content).includes("<hiring_brief_authoring_contract>"));
      return response([call("load", "load_capabilities", { capabilityIds: ["company_role_edit"] }), call("hidden", "update_data", {})], { reasoning_details: signature });
    }
    assert.ok(names.includes("update_data"));
    assert.ok(String(args.messages[0].content).includes("<hiring_brief_authoring_contract>"));
    assert.equal(args.upstreamProvider, "google-vertex");
    assert.deepEqual(args.messages.find((m) => m.role === "assistant")?.reasoning_details, signature);
    assert.ok(args.messages.some((m) => m.role === "tool" && m.tool_call_id === "hidden"));
    if (step === 2) return response([call("send", "update_data", {})]);
    return response([]);
  };
  const result = await runOrgAgentToolLoop(fixture(), { complete, executeTool: async (args) => { executed.push(args.callId); return { status: "queued" }; } });
  assert.deepEqual(executed, ["send"]);
  assert.equal(result.reply, "완료");
});

test("cold turn starts with base tools; read/loader-only provider failure is not a fabricated clarification", async () => {
  let step = 0;
  await assert.rejects(runOrgAgentToolLoop(fixture(), {
    complete: async (args) => {
      assert.ok(!args.tools!.some((t) => t.function.name === "web_search"));
      if (step++ === 0) return response([call("read", "read_talent", { talentId: "synthetic" })]);
      throw Error("provider unavailable");
    }, executeTool: async () => ({ candidate: { name: "Synthetic" } }),
  }), /provider unavailable/);
});

test("trusted capability preload exposes policy and tools in the first completion without loading unrelated tools", async () => {
  let completions = 0;
  const executed: string[] = [];
  await runOrgAgentToolLoop({ ...fixture(), initialCapabilities: ["company_role_edit"] }, {
    complete: async (args) => {
      const names = args.tools!.map((tool) => tool.function.name);
      assert.ok(names.includes("update_data"));
      assert.ok(!names.includes("web_search"));
      assert.ok(!names.includes("request_matching_search"));
      assert.ok(String(args.messages[0].content).includes("<hiring_brief_authoring_contract>"));
      return completions++ === 0 ? response([call("update", "update_data", {})]) : response([]);
    },
    executeTool: async (args) => { executed.push(args.name); return { status: "updated" }; },
  });
  assert.deepEqual(executed, ["update_data"]);
  assert.equal(completions, 2);
});

test("a continued contact task has policy and schema in its first completion", async () => {
  const args = fixture();
  args.context.conversationMessages = [{ id: 0, role: "assistant", source: "harper", speaker: "Harper", content: "초안을 준비했어요", references: "", complete: true, toolNames: ["contact_talent"] }];
  await runOrgAgentToolLoop(args, { complete: async (request) => {
    assert.ok(request.tools!.some((tool) => tool.function.name === "contact_talent"));
    assert.ok(String(request.messages[0].content).includes("## Candidate Contact"));
    assert.ok(!request.tools!.some((tool) => tool.function.name === "update_data"));
    return response([]);
  } });
});

test("intro projection exposes only board facts and exact follow-up time, never private profile/contact", () => {
  const item = { talentId: "talent", talent: { name: "Synthetic", headline: "개발", email: "private@example.invalid", bio: "private" }, roleId: "role", roleName: "Backend", recommendationId: "company-intro:intro", stage: "intro_requested", companyIntro: { id: "intro", status: "awaiting_talent", requestedAt: "2026-09-20T03:00:00Z", candidateSentAt: "2026-09-20T03:01:00Z" } };
  const result = buildCompanyIntroTalentRead([item] as any, [{ talent_id: "talent", role_id: "role", kind: "internal_followup_sent", created_at: "2026-09-24T02:50:00Z", metadata: { lastFollowupAt: "2026-09-24T02:50:00Z", email: "private@example.invalid" } }, { talent_id: "other", role_id: "role", kind: "internal_followup_sent" }] as any);
  assert.equal(result.candidate.email, null);
  assert.equal(result.profile, null);
  assert.equal(result.positions[0].candidateAccepted, false);
  assert.equal(result.recentProgress.length, 1);
  assert.equal(result.recentProgress[0].at, "2026-09-24T02:50:00Z");
  assert.ok(!JSON.stringify(result).includes("private@example.invalid"));
});

for (const emailSentAt of ["2026-10-06T01:15:00Z", null]) {
  test(`candidate-first delivery facts survive the intro reader and LLM serializer: ${emailSentAt}`, async () => {
    const { serializeOrgAgentToolResult } = await import("./promptFormat");
    const result = buildCompanyIntroTalentRead([{
      talentId: "talent", talent: { name: "Synthetic", headline: "개발", email: "private@example.invalid" },
      roleId: "role", roleName: "Backend", stage: "company_intro",
      companyIntro: { status: "ready", requestedAt: null, candidateSentAt: null,
        harperRecommendation: { availableInAppAt: "2026-10-06T01:00:00Z", emailSentAt } },
    }] as any, []);
    const single = serializeOrgAgentToolResult("read_talent", result);
    const batch = serializeOrgAgentToolResult("read_talent", { items: [result], requestedCount: 1, returnedCount: 1 });
    for (const text of [single, batch]) {
      assert.ok(text.includes("<harper_recommendations>"));
      assert.ok(text.includes("2026년 10월 6일 10:00 KST"));
      assert.ok(text.includes(emailSentAt ? "2026년 10월 6일 10:15 KST" : "조회 가능한 정보로 확인 불가"));
      assert.ok(text.includes("후보자의 열람 여부와 관심 표현 여부는 제공되지 않아 알 수 없다"));
      assert.ok(!text.includes("private@example.invalid"));
      assert.ok(text.includes("회사 연락 이력: 이번 조회에 포함되지 않음"));
      assert.ok(!text.includes("<company_contact_history>"));
      assert.ok(!text.includes("<harper_shared_information>"));
    }
  });
}

test("provider errors and output exhaustion are machine failures, not successful empty answers", () => {
  assert.equal(companyCompletionTokenBudget(ORG_AGENT_GEMINI_FLASH_MODEL, 4000), 8192);
  assert.throws(() => validateCompanyCompletion({ choices: [{ finish_reason: "error", error: { code: 429, message: "rate limited" } }] }), (error: any) => error.status === 429);
  assert.throws(() => validateCompanyCompletion({ choices: [{ finish_reason: "length", message: { content: "" } }] }), /output budget/);
  assert.doesNotThrow(() => validateCompanyCompletion({ choices: [{ finish_reason: "stop", message: { content: "" } }] })); // Silent event completion is allowed.
});

test("actual executor checks Role access then rejects incompatible targets before contact reads or writes", async () => {
  const f = fixture();
  f.admin = authorizedRoleReads() as any;
  await assert.rejects(executeOrgAgentTool({ ...f, audience: "company_safe", callId: "contact", name: "contact_talent", state: createOrgAgentToolExecutionState(f.context), input: { action: "send", relayId: "relay", talentId: "talent", roleId: "role", messageContent: "확인 부탁드려요" } }), /not both target forms/);
});

test("repeated loading consumes the ordinary tool budget and ends with a tool-free completion", async () => {
  let completions = 0, final = false;
  await runOrgAgentToolLoop(fixture(), { complete: async (args) => {
    completions++;
    if (!args.allowTools) { final = true; return response([]); }
    return response([call(`load-${completions}`, "load_capabilities", { capabilityIds: ["candidate_contact"] })]);
  }, executeTool: async () => { throw Error("No domain execution expected"); } });
  assert.ok(final);
  assert.ok(completions <= 31);
});

test("actual direct-contact retry returns persisted delivery without writing copy or presenting a draft", async () => {
  const f = fixture();
  const state = createOrgAgentToolExecutionState(f.context);
  state.roleById.set("role", { roleId: "role", name: "Backend" } as any);
  const filters: Record<string, unknown> = {};
  const query: any = {
    select() { return query; },
    eq(key: string, value: unknown) { filters[key] = value; return query; },
    maybeSingle() { return { data: { id: "persisted", workflow_status: "queued", delivery_body: "이미 저장한 본문", deliveries: [{ type: "company_request_candidate_delivery", status: "processing", scheduled_at: "2026-09-25T00:00:00Z" }] }, error: null }; },
  };
  const accessReads = authorizedRoleReads();
  const admin = { from(table: string) {
    if (["company_user_workspace", "company_roles"].includes(table)) return accessReads.from(table);
    assert.equal(table, "company_talent_requests"); return query;
  } };
  const result = await executeOrgAgentTool({ ...f, admin: admin as any, audience: "company_safe", callId: "retry", name: "contact_talent", state, input: { action: "send", talentId: "talent", roleId: "role", messageContent: "다른 문구로 생성하지 않아야 함" } });
  assert.equal((result as any).status, "processing");
  assert.equal((result as any).idempotent, true);
  assert.equal((result as any).body, "이미 저장한 본문");
  assert.equal(state.requiredPresentationText, null);
  assert.equal(state.contactDraftRef, null);
  assert.deepEqual(filters, { company_workspace_id: "workspace", role_id: "role", talent_id: "talent", source_company_message_id: 1 });
});

test("settings change then explicit decline keeps delivery and decision facts in the company LLM input", async () => {
  const { serializeOrgAgentToolResult } = await import("./promptFormat");
  const item = {
    talentId: "talent", talent: { name: "Synthetic", headline: "Backend" },
    roleId: "role", roleName: "Backend", recommendationId: "company-intro:intro", stage: "process_stopped",
    companyIntro: { id: "intro", status: "closed", closeReason: "talent_declined",
      talentDecisionAt: "2026-10-06T08:20:13Z", requestedAt: "2026-10-06T08:12:00Z", candidateSentAt: "2026-10-06T08:13:34Z" },
  };
  const result = buildCompanyIntroTalentRead([item] as any, [
    { talent_id: "talent", role_id: "role", kind: "candidate_contact_preferences_changed", created_at: "2026-10-06T08:19:43Z", metadata: { profileVisibility: "dont_share", internalRecommendationEnabled: false, privateReason: "PRIVATE_REASON" } },
    { talent_id: "talent", role_id: "role", kind: "company_intro_decision", created_at: "2026-10-06T08:20:13Z", text: "후보자가 회사 제안을 거절했습니다.", metadata: { privateReason: "PRIVATE_REASON" } },
  ] as any);
  assert.equal(result.positions[0].closed, true);
  assert.equal(result.positions[0].introCloseReason, "talent_declined");
  assert.equal(result.positions[0].candidateSentAt, item.companyIntro.candidateSentAt);
  assert.equal(result.recentProgress.length, 2);
  assert.equal(
    (result.recentProgress[0].metadata as Record<string, unknown>)?.existingIntroDecisionChanged,
    false
  );
  const serialized = serializeOrgAgentToolResult("read_talent", result);
  assert.ok(serialized.includes("2026년 10월 6일 17:13 KST"));
  assert.ok(serialized.includes("2026년 10월 6일 17:20 KST"));
  assert.ok(serialized.includes("talent_declined"));
  assert.ok(!serialized.includes("PRIVATE_REASON"));
});

test("all company tools return unexpected object errors to the next model completion", async () => {
  let step = 0;
  const failure = { message: "remote read failed", code: "UPSTREAM_NEW", details: "connection reset", hint: "check remote status" };
  await runOrgAgentToolLoop(fixture(), {
    complete: async args => {
      if (step++ === 0) return response([call("read", "read_talent", { talentId: "synthetic" })]);
      const output = String(args.messages.find(m => m.role === "tool" && m.tool_call_id === "read")?.content);
      for (const detail of Object.values(failure)) assert.ok(output.includes(detail), detail);
      assert.ok(!output.includes("[object Object]"));
      return response([]);
    },
    executeTool: async () => { throw failure; },
  });
  assert.equal(step, 2);
});
