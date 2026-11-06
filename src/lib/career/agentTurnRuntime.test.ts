import assert from "node:assert/strict";
import test from "node:test";
import { prepareCareerAgentTurn, CareerAgentReplyUnavailable, readCareerContinuationUserContext, readCareerAgentResourceContext } from "./agentTurnRuntime.server";
import { CareerReplyContinuation } from "./capabilities/runtime";
import { findCareerHandbook } from "./handbooks/registry";
import { getLlmUsageContext } from "@/lib/llm/usageContext";
import { appendCareerOpportunityMentionMetadata, stripCareerOpportunityMentionMetadata } from "./opportunityMentionText";

function fixture(options: { accepted?: boolean; completed?: boolean; checkpoint?: unknown; handbooks?: unknown[] } = {}) {
  const calls: Array<{ name: string; args: any }> = [];
  const book = { id: "resume", version: findCareerHandbook("resume")!.version, remainingReplies: 2 };
  const admin = {
    rpc: async (name: string, args: any) => {
      if (name === "read_open_career_forms") return { data: [{ id: 82, payload: { formId: 81, revision: 2, title: "검토본" } }], error: null };
      calls.push({ name, args });
      return { data: name === "claim_career_agent_turn" ? {
        accepted: options.accepted ?? true, completed: options.completed,
        state: { version: 1, completedSequence: 4, handbooks: options.handbooks ?? [book], checkpoint: options.checkpoint },
      } : true, error: null };
    },
    from: (table: string) => {
      const result = { data: table === "talent_external_operations"
        ? [{ id: "owned-session", kind: "browser_session", status: "human" }]
        : [{ id: 82, formId: "81", revision: "2", title: "검토본", hidden: "false" }], error: null };
      let kind: string | undefined;
      const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(kind === "delegated_work" ? { data: [], error: null } : result).then(resolve),
        maybeSingle: async () => ({ data: null, error: null }),
        eq: (key: string, value: string) => { if (key === "kind") kind = value; return query; } };
      for (const name of ["select", "neq", "order", "limit", "or"]) query[name] = () => query;
      return query;
    },
  } as any;
  const args: Parameters<typeof prepareCareerAgentTurn>[0] = {
    admin, userId: "owner", conversationId: "conversation", sourceMessage: null,
    agentReplyId: "event:exact", mode: "progressive",
    eligibleTools: [{ type: "function", function: { name: "read_talent_context", description: "read", parameters: {} } }],
    promptArgs: { channel: "chat", isOnboardingDone: true, profile: null, careerCoachingActivity: null,
      structuredProfileText: "Profile", talentContextSection: "", currentPreferences: { preferredLocale: "ko" } },
    selectionSnapshot: { capabilityIds: [], handbookIds: [], status: "selected", elapsedMs: 0 },
  };
  return { args, calls };
}

for (const inbox of [false, true]) for (const native of [false, true]) {
  test(`first ${native ? "Anthropic" : "OpenAI"} request contains the selected posting (${inbox ? "inbox" : "inline"}), without changing user text`, async t => {
    const { args } = fixture();
    args.userId = "00000000-0000-4000-8000-000000000090";
    args.conversationId = "00000000-0000-4000-8000-000000000091";
    const roleId = "00000000-0000-4000-8000-000000000001";
    const description = "  # Original JD\n\n담당 업무와 자격 요건\n2026-12-01T09:00:00+09:00\n" + "Full source paragraph.\n".repeat(800) + "  ";
    const visible = "Example · Engineer에 지원해줘.";
    const source = { id: 41, user_id: args.userId, conversation_id: args.conversationId, role: "user", message_type: "chat", payload: {},
      content: appendCareerOpportunityMentionMetadata(visible, [{ roleId, label: "Example · Engineer" }]), created_at: "2026-11-05T00:00:00Z" } as any;
    const originalSource = structuredClone(source);
    const originalFrom = args.admin.from.bind(args.admin);
    const originalRpc = args.admin.rpc.bind(args.admin) as any;
    let reads = 0;
    args.admin.from = ((table: string) => {
      if (table !== "company_roles") {
        const query = originalFrom(table as any) as any;
        if (table === "talent_messages") query.maybeSingle = async () => ({ data: source, error: null });
        if (native && table === "talent_opportunity_recommendation") query.maybeSingle = async () => ({ data: {
          id: "00000000-0000-4000-8000-000000000092", feedback: "positive", saved_stage: "saved",
        }, error: null });
        if (native && table === "talent_external_operations") {
          const originalEq = query.eq;
          query.eq = (key: string, value: unknown) => {
            originalEq(key, value);
            if (key === "kind" && value === "delegated_work") {
              query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{
                id: "00000000-0000-4000-8000-000000000093", user_id: args.userId, conversation_id: args.conversationId,
                kind: "delegated_work", parent_id: null, idempotency_key: "apply", status: "waiting", revision: 3,
                request: { target: roleId, instruction: "Apply to this role", source_refs: [40] },
                result: { note: "Resume ready; waiting for work authorization answer", refs: ["form-40"] },
                provider_refs: {}, created_at: "2026-11-05T00:00:00Z", updated_at: "2026-11-05T01:00:00Z",
              }], error: null }).then(resolve);
            }
            return query;
          };
        }
        return query;
      }
      reads++;
      const query: any = { select: () => query,
        in: (key: string, ids: string[]) => { assert.deepEqual([key, ids], ["role_id", [roleId]]); return query; },
        eq: (key: string, value: string) => { assert.deepEqual([key, value], ["source_type", "external"]); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ role_id: roleId, source_type: "external", name: "Engineer", description,
          external_jd_url: "https://example.invalid/jobs/engineer", company_workspace: { company_name: "Example", company_db: null } }], error: null }).then(resolve),
      };
      return query;
    }) as any;
    (args.admin as any).rpc = (name: string, input: any) => name === "read_career_inbox"
      ? Promise.resolve({ data: { messages: [source], inputIds: [41], deliveredIds: [], completed: false }, error: null })
      : originalRpc(name === "claim_career_inbox" ? "claim_career_agent_turn" : name, input);
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) {
      const previous = process.env[key]; process.env[key] = "test-key";
      t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
    }
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (url: unknown, init?: RequestInit) => {
      if (String(url).includes("/rest/v1/")) return Response.json([]);
      requests++;
      const body = JSON.parse(String(init?.body));
      const text = JSON.stringify(body);
      assert.ok(text.includes(JSON.stringify(description).slice(1, -1)), "full original JD reaches the first provider request");
      for (const fact of ["Company: Example", "Role: Engineer", "https://example.invalid/jobs/engineer"]) assert.ok(text.includes(fact));
      for (const fact of native ? ["revision 3; waiting", "Resume ready; waiting for work authorization answer", "form-40", "00000000-0000-4000-8000-000000000092: saved.", "Work in index above:"]
        : ["Saved opportunity: none.", "Work history: none."]) assert.ok(text.includes(fact), fact);
      if (native) {
        assert.equal(text.split("Resume ready; waiting for work authorization answer").length - 1, 1);
        assert.ok(!text.includes("Apply to this role"), "full work instructions stay in the read tool");
      }
      assert.ok(!text.includes("Read existing work before choosing an execution path."));
      return native
        ? Response.json({ id: "selected", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "지원 준비를 진행할게요." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
        : Response.json({ id: "selected", model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "지원 준비를 진행할게요." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    });
    const turn = await prepareCareerAgentTurn({ ...args, agentReplyId: undefined, sourceMessage: inbox ? null : source, ...(inbox ? { inboxId: "selected-inbox" } : {}) });
    try {
      const { runCareerChatAssistant } = await import("./llm");
      const step = turn.runtime.resolveStep(false);
      await runCareerChatAssistant({ primaryModel: native ? "claude-haiku-5-5" : "gpt-6.1-sol", toolRuntime: turn.runtime,
        tools: step.tools, systemBlocks: step.systemBlocks, messages: inbox ? [] : [{ role: "user", content: visible }],
        usageLabel: "test:selected-posting-context", executeTool: async () => { throw new Error("No role lookup tool needed"); } });
      assert.equal(requests, 1);
      assert.equal(reads, 1);
      assert.deepEqual(source, originalSource);
      assert.equal(stripCareerOpportunityMentionMetadata(source.content), visible);
    } finally { await turn.release(); }
  });
}

test("claim completion consumes once after a supplied reply and keeps recovery payload exact", async () => {
  const { args, calls } = fixture();
  const turn = await prepareCareerAgentTurn({ ...args, adaptPromptBlocks: blocks => [...blocks, { key: "transport", text: "Email transport", cacheable: false }] });
  for (let i = 0; i < 3; i++) {
    const step = turn.runtime.resolveStep(false);
    const prompt = step.systemBlocks.map(block => block.text).join("\n");
    assert.ok(prompt.includes("session_id owned-session; status human"));
    assert.ok(prompt.includes("formId 81, revision 2"));
    assert.equal(prompt.split("Email transport").length - 1, 1);
    await turn.runtime.beforeCompletion(step, { transport: "chat", messages: [] });
  }
  const payload = turn.getCompletionPayload();
  assert.equal(payload.handbooks[0].remainingReplies, 1);
  await turn.complete(); await turn.complete(); await turn.release();
  const finished = calls.filter(call => call.name === "finish_career_agent_turn");
  assert.equal(finished.length, 1);
  assert.deepEqual(finished[0].args.p_record, payload.record);
  assert.deepEqual(finished[0].args.p_handbooks, payload.handbooks);
  assert.ok(!calls.some(call => call.name === "release_career_agent_turn"));
});

test("resuming uses current guide counters and does not inject an expired carried handbook", async () => {
  const { args } = fixture();
  const first = await prepareCareerAgentTurn(args);
  const step = first.runtime.resolveStep(false);
  const checkpoint = {
    version: 1 as const, checkpointId: "checkpoint", replyId: args.agentReplyId!, transport: "chat" as const,
    messages: [], systemBlocks: step.systemBlocks, tools: step.tools, capabilityIds: [],
    handbooks: first.runtime.handbooks.snapshot(), record: first.runtime.completedRecord(),
  };
  await first.release();
  const expired = await prepareCareerAgentTurn(fixture({ checkpoint, handbooks: [] }).args);
  assert.deepEqual(expired.runtime.handbooks.snapshot(), []);
  assert.ok(!expired.runtime.resolveStep(false).systemBlocks.some(block => block.key === "handbook:resume"));
  await expired.release();
  const localReload = await prepareCareerAgentTurn(fixture({ checkpoint: {
    ...checkpoint, record: { ...checkpoint.record, loadedHandbooks: ["resume"] },
  }, handbooks: [] }).args);
  assert.equal(localReload.runtime.handbooks.snapshot()[0].remainingReplies, 2);
  await localReload.release();
});

test("the claimed inbox checkpoint fences a stale wakeup and new input can resume a pending dependency", async () => {
  const initial = fixture();
  const first = await prepareCareerAgentTurn(initial.args);
  const checkpoint = {
    version: 1 as const, checkpointId: "saved", replyId: "invocation:inbox", transport: "chat" as const,
    messages: [{ role: "tool", content: "Evaluation is still running" }],
    tools: [], capabilityIds: [], handbooks: [], record: first.runtime.completedRecord(),
    inputMessageIds: [10], waitFor: [{ kind: "external_evaluation" as const, id: "pending-run" }],
  };
  await first.release();
  const { args, calls } = fixture({ checkpoint });
  let pending: any[] = [];
  const originalRpc = args.admin.rpc.bind(args.admin) as any;
  const originalFrom = args.admin.from.bind(args.admin) as any;
  (args.admin as any).rpc = (name: string, input: any) => {
    if (name === "claim_career_inbox") return originalRpc("claim_career_agent_turn", input);
    if (name === "read_career_inbox") return Promise.resolve({ data: { messages: pending, inputIds: [10, 11], deliveredIds: [10], completed: false }, error: null });
    return originalRpc(name, input);
  };
  (args.admin as any).from = (table: string) => {
    const query = originalFrom(table);
    if (table === "external_recommendation_runs") query.maybeSingle = async () => ({ data: { status: "running" }, error: null });
    return query;
  };
  const input = { ...args, inboxId: "inbox", agentReplyId: checkpoint.replyId, resumeDependenciesPending: false };
  await assert.rejects(prepareCareerAgentTurn(input), CareerReplyContinuation);
  assert.ok(calls.some(call => call.name === "release_career_agent_turn"));
  pending = [{ id: 11, role: "user", content: "추가로 이 자료도 확인해줘.", message_type: "chat", payload: {}, created_at: "2026-11-04T00:00:00Z" }];
  const resumed = await prepareCareerAgentTurn(input);
  try {
    assert.equal(resumed.runtime.options.resumeDependenciesPending, true);
    const messages = structuredClone(checkpoint.messages);
    await resumed.runtime.beforeCompletion(resumed.runtime.resolveStep(false), { transport: "chat", messages });
    assert.equal(messages.length, 2);
    assert.ok(messages[1].content.includes("User message 11:"));
    assert.equal(calls.at(-1)?.name, "checkpoint_career_inbox");
    assert.deepEqual(calls.at(-1)?.args.p_checkpoint.inputMessageIds, [10, 11]);
  } finally { await resumed.release(); }
});

test("checkpoint persists before enqueue and a cancelled reply releases without consumption", async () => {
  const { args, calls } = fixture();
  let queued = false;
  const turn = await prepareCareerAgentTurn({ ...args, deadlineAt: 0,
    promptArgs: { ...args.promptArgs, runtimeInstruction: "Original event context" },
    onCheckpoint: async checkpoint => {
      assert.equal(calls.at(-1)?.name, "checkpoint_career_agent_turn");
      assert.equal(checkpoint.record.status, "in_progress");
      assert.deepEqual(checkpoint.continuation, { channel: "career", runtimeInstruction: "Original event context" });
      queued = true;
    },
  });
  await assert.rejects(turn.runtime.beforeCompletion(turn.runtime.resolveStep(false), {
    transport: "chat", model: "gpt-6.1-sol", messages: [{ role: "tool", content: "Already sent once" }],
  }), CareerReplyContinuation);
  assert.ok(queued);
  await turn.release(); await turn.release();
  assert.equal(calls.filter(call => call.name === "release_career_agent_turn").length, 1);
  assert.ok(!calls.some(call => call.name === "finish_career_agent_turn"));
});

test("adapter checkpoints keep their original delivery ownership", async () => {
  const { args } = fixture();
  const turn = await prepareCareerAgentTurn({ ...args, deadlineAt: 0,
    continuation: { channel: "adapter", sourceMessageId: 92 },
    onCheckpoint: async checkpoint => assert.deepEqual(checkpoint.continuation, { channel: "adapter", sourceMessageId: 92 }),
  });
  await assert.rejects(turn.runtime.beforeCompletion(turn.runtime.resolveStep(false), { transport: "chat", messages: [] }), CareerReplyContinuation);
  await turn.release();
});

test("busy and already delivered replies do not select capabilities or execute tools", async () => {
  for (const completed of [false, true]) {
    const { args, calls } = fixture({ accepted: false, completed });
    await assert.rejects(prepareCareerAgentTurn(args), error => {
      assert.ok(error instanceof CareerAgentReplyUnavailable);
      assert.equal(error.completed, completed);
      return true;
    });
    assert.deepEqual(calls.map(call => call.name), ["claim_career_agent_turn"]);
  }
});

test("continuation receives later user changes with exact source identifiers without losing earlier unconsumed instructions", async () => {
  const { args } = fixture();
  const rows = Array.from({ length: 17 }, (_, index) => ({
    id: 70 - index, role: "user", message_type: "chat", payload: {},
    content: index === 0 ? "아직 보내지 말고 제목을 바꿔줘." : `추가 원문 ${index}`,
    created_at: "2026-10-30T03:04:05.999Z",
  })).reverse();
  const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
  for (const name of ["select", "eq", "gt", "order", "limit", "or"]) query[name] = () => query;
  const context = await readCareerContinuationUserContext({ ...args,
    admin: { from: () => query } as any, sourceMessage: { id: 41 } as any,
  });
  assert.ok(context.includes("User message 70 (2026-10-30 12:04):"));
  assert.ok(context.includes("아직 보내지 말고 제목을 바꿔줘."));
  assert.ok(context.includes("User message 54"));
  assert.ok(!context.includes("T03:04:05"));
  assert.ok(context.indexOf("User message 55") < context.indexOf("User message 70"));
});

test("first queued and external replies retain their source and receive later user changes before a checkpoint exists", async () => {
  for (const replyId of ["external:completed-run", "message:41"]) {
  const { args } = fixture();
  const source = { id: 41, user_id: args.userId, conversation_id: args.conversationId,
    role: "user", content: "Prepare the original application.", payload: {}, created_at: "2026-10-30T00:00:00Z" } as any;
  let laterReads = 0;
  args.admin.from = ((_table: string) => {
    let later = false;
    const query: any = {
      gt: (key: string, value: number) => { assert.equal(key, "id"); assert.equal(value, source.id); later = true; return query; },
      maybeSingle: async () => ({ data: source, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (later) laterReads++;
        return Promise.resolve({ data: later ? [{ id: 44, role: "user", message_type: "chat", payload: {},
          content: "Stop before submitting that application.", created_at: "2026-10-30T00:01:00Z" }] : [], error: null }).then(resolve);
      },
    };
    for (const name of ["select", "eq", "neq", "order", "limit", "or"]) query[name] = () => query;
    return query;
  }) as any;
  let checkpointSource: number | undefined;
  const turn = await prepareCareerAgentTurn({ ...args, sourceMessage: source, agentReplyId: replyId, deadlineAt: 0,
    onCheckpoint: async checkpoint => { checkpointSource = checkpoint.continuation?.sourceMessageId; },
  });
  const step = turn.runtime.resolveStep(false);
  const prompt = step.systemBlocks.map(block => block.text).join("\n");
  assert.equal(laterReads, 1);
  assert.ok(prompt.includes("User message 44"));
  assert.ok(prompt.includes("Stop before submitting that application."));
  assert.equal(turn.runtime.runWithUsageContext(() => getLlmUsageContext()?.sourceMessageId), 41);
  await assert.rejects(turn.runtime.beforeCompletion(step, { transport: "chat", messages: [] }), CareerReplyContinuation);
  assert.equal(checkpointSource, 41);
  await turn.release();
  }
});

test("the browser index includes the last report without injecting full evidence or execution instructions", async () => {
  const { args } = fixture();
  const sessions = [
    { id: "session-a", status: "human", current_execution_id: "run-a", result: { browser_availability: "running" } },
    { id: "session-b", status: "human", current_execution_id: "run-b", result: { browser_availability: "stopped" } },
  ];
  const executions = sessions.map((session, index) => ({
    id: session.current_execution_id, parent_id: session.id, status: "completed", revision: 3,
    updated_at: "2026-10-30T00:01:02Z",
    request: { url: `https://example.com/job-${index}`, role_refs: [], task: "PRIVATE_EXECUTION_INSTRUCTIONS" },
    result: { url: `https://example.com/login-${index}`, summary: `Application ${index} is waiting at login; resume saved.`, needsUser: true },
    provider_refs: { liveUrl: "PRIVATE_VIEWER_TOKEN" },
  }));
  let executionReads = 0;
  args.admin.from = ((table: string) => {
    const filters: Record<string, unknown> = {};
    const query: any = {
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, ids: string[]) => { assert.equal(key, "id"); assert.deepEqual(ids, ["run-a", "run-b"]); return query; },
      then: (resolve: (value: unknown) => unknown) => {
        if (table === "talent_external_operations") {
          assert.equal(filters.user_id, args.userId);
          assert.equal(filters.conversation_id, args.conversationId);
          if (filters.kind === "browser_run") executionReads++;
        }
        return Promise.resolve({ data: table === "talent_external_operations"
          ? filters.kind === "browser_run" ? executions : sessions : [], error: null }).then(resolve);
      },
    };
    for (const name of ["select", "neq", "order", "limit", "is"]) query[name] = () => query;
    return query;
  }) as any;
  const context = await readCareerAgentResourceContext(args);
  assert.equal(executionReads, 1);
  for (const execution of executions) {
    assert.ok(context.includes(`session_id ${execution.parent_id}`));
    assert.ok(context.includes(`execution_id ${execution.id}; status completed; revision 3`));
    assert.ok(context.includes(execution.request.url));
    assert.ok(context.includes(execution.result.url));
    assert.ok(context.includes(execution.result.summary));
  }
  assert.ok(context.includes("Browser reports further input/action needed: yes"));
  assert.ok(context.includes("live browser stopped"));
  assert.ok(context.includes("2026-10-30 09:01"));
  assert.ok(!context.includes("PRIVATE_") && !context.includes("T00:01:02"));
});

test("resource context supplies the document metadata page and preserves its next-page cursor", async () => {
  const { args } = fixture();
  const originalFrom = args.admin.from.bind(args.admin) as any;
  const rows = Array.from({ length: 11 }, (_, index) => ({ id: `document-${index}`, file_name: `Saved document ${index}`, kind: "document", revision: index + 1 }));
  args.admin.from = ((table: string) => {
    if (table !== "talent_documents") return originalFrom(table);
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: (columns: string) => { assert.ok(!columns.includes("extracted_text") && !columns.includes("structured_content")); return query; },
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: () => query, order: () => query,
      range: async (from: number, to: number) => {
        assert.deepEqual(filters, { talent_id: args.userId, is_deleted: false });
        assert.deepEqual([from, to], [0, 10]);
        return { data: rows, error: null };
      },
    };
    return query;
  }) as any;
  const turn = await prepareCareerAgentTurn(args);
  try {
    const context = turn.runtime.resolveStep(false).systemBlocks.map(block => block.text).join("\n");
    assert.match(context, /document_id document-0; Saved document 0; document; revision 1/);
    assert.match(context, /document_id document-9; Saved document 9; document; revision 10/);
    assert.ok(!context.includes("document_id document-10;"));
    assert.match(context, /list_documents offset 10/);
  } finally { await turn.release(); }
});

for (const transport of ["chat", "anthropic"] as const) {
  test(`${transport} continuation receives the complete browser receipt without a read tool, and checkpoints it once`, async (t) => {
    const initial = await prepareCareerAgentTurn(fixture().args);
    const step = initial.runtime.resolveStep(false);
    const originalMessages = [{ role: "user", content: "Prepare the application and preserve all observed requirements." }];
    const checkpoint = { version: 1 as const, checkpointId: "browser-wait", replyId: "event:exact", transport,
      messages: originalMessages, systemBlocks: step.systemBlocks, tools: step.tools, capabilityIds: [], handbooks: [],
      record: initial.runtime.completedRecord(), waitFor: [{ kind: "browser_run" as const, id: "finished-browser" }] };
    await initial.release();
    const { args, calls } = fixture({ checkpoint });
    const originalFrom = args.admin.from.bind(args.admin) as any;
    const evidence = "Optional survey source text is preserved in full. No submission occurred.";
    const run = { id: "finished-browser", kind: "browser_run", parent_id: "closed-session", status: "completed", revision: 4,
      updated_at: "2026-11-05T03:00:00Z", request: { task: "PRIVATE_EXECUTION_INSTRUCTION" },
      result: { summary: "Resume selected; visa answer still missing.", evidence: [evidence], needsUser: false }, provider_refs: { liveUrl: "PRIVATE_TOKEN" } };
    args.admin.from = ((table: string) => {
      const query = originalFrom(table) as any;
      if (table !== "talent_external_operations") return query;
      const filters: Record<string, unknown> = {};
      const originalEq = query.eq;
      query.eq = (key: string, value: unknown) => { filters[key] = value; return originalEq(key, value); };
      query.in = (key: string, ids: string[]) => {
        assert.deepEqual([key, ids], ["id", [run.id]]);
        assert.deepEqual(filters, { user_id: args.userId, conversation_id: args.conversationId, kind: "browser_run" });
        return Promise.resolve({ data: [run], error: null });
      };
      return query;
    }) as any;
    run.status = "running";
    const runningTurn = await prepareCareerAgentTurn({ ...args, resumeDependenciesPending: true });
    try { assert.deepEqual(runningTurn.runtime.resumedMessages(transport), originalMessages); }
    finally { await runningTurn.release(); }
    run.status = "completed";
    const turn = await prepareCareerAgentTurn(args);
    try {
      const messages = turn.runtime.resumedMessages(transport)!;
      assert.deepEqual(messages[0], originalMessages[0]);
      assert.equal(messages.length, 2);
      const text = JSON.stringify(messages[1]);
      assert.ok(text.includes(evidence) && text.includes(run.result.summary));
      assert.ok(text.includes("execution_id: finished-browser") && !text.includes("PRIVATE_"));
      assert.equal(originalMessages.length, 1);

      const { runCareerChatAssistant } = await import("./llm");
      const priorKey = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "test-key";
      t.after(() => { if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = priorKey; });
      let requests = 0;
      t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
        requests++;
        const body = JSON.parse(String(init?.body));
        assert.ok(JSON.stringify(body.messages ?? body.input).includes(evidence));
        return transport === "anthropic"
          ? Response.json({ id: "receipt", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "필수 답변을 기다리고 있습니다." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
          : Response.json({ id: "receipt", model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "필수 답변을 기다리고 있습니다." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
      });
      const current = turn.runtime.resolveStep(false);
      await runCareerChatAssistant({ primaryModel: transport === "anthropic" ? "claude-haiku-5-5" : "gpt-6.1-sol", toolRuntime: turn.runtime,
        tools: current.tools, systemBlocks: current.systemBlocks, messages: [], usageLabel: "test:browser-completion-context",
        executeTool: async () => { throw new Error("No browser read should be needed for this receipt"); } });
      assert.equal(requests, 1);
      turn.runtime.options.deadlineAt = 0;
      await assert.rejects(turn.runtime.beforeCompletion(current, { transport, messages }), CareerReplyContinuation);
      const saved = calls.findLast(call => call.name === "checkpoint_career_agent_turn")!.args.p_checkpoint;
      assert.equal(saved.waitFor, undefined);
      assert.equal(JSON.stringify(saved.messages).split(evidence).length - 1, 1);
    } finally { await turn.release(); }
  });
}


test("a resumed reply sees Stop on later requests without modifying their original prose", async () => {
  const { args } = fixture();
  const original = "Use 2026-10-31T08:09:10Z exactly as written.";
  const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{
    id: 70, role: "user", message_type: "chat", payload: { careerTurnStopped: true }, content: original,
    created_at: "2026-10-31T00:00:00Z",
  }], error: null }).then(resolve) };
  for (const name of ["select", "eq", "gt", "order", "limit", "or"]) query[name] = () => query;
  const context = await readCareerContinuationUserContext({ ...args,
    admin: { from: () => query } as any, sourceMessage: { id: 41 } as any,
  });
  assert.ok(context.includes(original));
  assert.ok(context.includes("The user requested Stop for this request."));
});


test("legacy internal-evaluation checkpoints finish without rebuilding or replaying model input", async () => {
  const {args,calls} = fixture({checkpoint:{replyId:"event:exact",checkpointId:"private-old",waitFor:[{kind:"internal_evaluation",id:"private-run"}],record:{version:2},messages:[{role:"tool",content:"Private assessment"}]}});
  await assert.rejects(prepareCareerAgentTurn(args), error => error instanceof CareerAgentReplyUnavailable && error.completed);
  assert.equal(calls.filter(c=>c.name==="finish_career_agent_turn").length,1);
  assert.equal(calls.find(c=>c.name==="finish_career_agent_turn")?.args.p_record.status,"cancelled");
  assert.equal(calls.some(c=>c.name==="release_career_agent_turn"),false);
});

test("a delegated continuation receives the exact action selected for a later ordinary chat reply", async () => {
  const { args } = fixture();
  const action = { id: "00000000-0000-4000-8000-000000000071", revision: 2,
    title: "Cedar 입사 가능일", description: "입사 가능한 날짜를 알려주세요", buttonText: "답하기",
    action: { type: "compose_reply", text: "work 00000000-0000-4000-8000-000000000051, form 84 revision 1" }, priority: 1, urgency: "normal" };
  const rows = [{ id: 42, role: "user", message_type: "chat", payload: { careerActionItem: action }, content: "11월 말이요", created_at: "2026-11-04T13:00:00Z" }];
  const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve) };
  for (const name of ["select", "eq", "gt", "order", "limit", "or"]) query[name] = () => query;
  const context = await readCareerContinuationUserContext({ ...args, admin: { from: () => query } as any, sourceMessage: { id: 41 } as any });
  assert.ok(context.includes("11월 말이요"));
  assert.ok(context.includes(action.title));
  assert.ok(context.includes(action.action.text));
  assert.ok(context.includes("revision 2"));
});


test("manual browser control checkpoints the original turn until the user returns it", async () => {
  const { args, calls } = fixture();
  const turn = await prepareCareerAgentTurn(args);
  try {
    const step = turn.runtime.resolveStep(false);
    await turn.runtime.recordResult("use_browser", { careerContinuation: { kind: "browser_control", id: "human-session" } }, step);
    await assert.rejects(turn.runtime.beforeCompletion(step, { transport: "chat", messages: [{ role: "tool", content: "The user controls the browser." }] }), CareerReplyContinuation);
    assert.deepEqual(calls.findLast(call => call.name === "checkpoint_career_agent_turn")?.args.p_checkpoint.waitFor,
      [{ kind: "browser_control", id: "human-session" }]);
  } finally { await turn.release(); }
});


for (const transport of ["chat", "anthropic"] as const) {
  test(`${transport} provider receives browser Done as execution context and preserves the original request`, async t => {
    const { formatBrowserControlReturn } = await import("./browser/control");
    const session = { id: "returned-browser", kind: "browser_session", status: "idle", revision: 5,
      updated_at: "2026-11-06T00:00:00Z", request: {}, result: { requested_action: "resume", control_source: "user" },
      provider_refs: { current_execution_id: "previous-run", liveUrl: "PRIVATE_VIEWER_TOKEN" } } as any;
    const event = formatBrowserControlReturn(session, [{ id: "previous-run", kind: "browser_run", parent_id: session.id,
      status: "cancelled", revision: 2, updated_at: session.updated_at,
      request: { task: "Continue preparing this application after login." }, result: { summary: "Sign-in page was open. No submission occurred.", needsUser: true }, provider_refs: {} } as any], 4);
    const initial = await prepareCareerAgentTurn(fixture().args);
    const step = initial.runtime.resolveStep(false);
    const messages = [...(transport === "chat" ? [{ role: "system", content: step.systemBlocks.map(block => block.text).join("\n\n") }] : []), { role: "user", content: "지원서를 작성해줘. 제출은 하지 마." }];
    const checkpoint = { version: 1 as const, checkpointId: "human-wait", replyId: "event:exact", transport,
      messages, systemBlocks: step.systemBlocks, tools: step.tools, capabilityIds: [], handbooks: [], record: initial.runtime.completedRecord(),
      waitFor: [{ kind: "browser_control" as const, id: session.id }] };
    await initial.release();
    const { args } = fixture({ checkpoint });
    args.promptArgs.runtimeInstruction = event;
    const turn = await prepareCareerAgentTurn(args);
    const priorKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key";
    t.after(() => { if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = priorKey; });
    let requests = 0;
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requests++;
      const payload = String(init?.body);
      assert.ok(payload.includes("selected Done") && payload.includes("not a chat message or new authorization"));
      assert.ok(payload.includes("지원서를 작성해줘. 제출은 하지 마."));
      assert.ok(payload.includes("No submission occurred."));
      assert.ok(!payload.includes("PRIVATE_VIEWER_TOKEN"));
      return transport === "anthropic"
        ? Response.json({ id: "done", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "현재 화면을 확인하고 작성을 이어갈게요." }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } })
        : Response.json({ id: "done", model: "gpt-6.1-sol", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "현재 화면을 확인하고 작성을 이어갈게요." }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    });
    try {
      const current = turn.runtime.resolveStep(false);
      const { runCareerChatAssistant } = await import("./llm");
      await runCareerChatAssistant({ primaryModel: transport === "anthropic" ? "claude-haiku-5-5" : "gpt-6.1-sol", toolRuntime: turn.runtime,
        tools: current.tools, systemBlocks: current.systemBlocks, messages: [], usageLabel: "test:browser-control-return",
        executeTool: async () => { throw new Error("Unexpected tool"); } });
      assert.equal(requests, 1);
      assert.deepEqual(messages.filter(message => message.role === "user"), [{ role: "user", content: "지원서를 작성해줘. 제출은 하지 마." }]);
    } finally { await turn.release(); }
  });
}
