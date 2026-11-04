import assert from "node:assert/strict";
import test from "node:test";
import { prepareCareerAgentTurn, CareerAgentReplyUnavailable, readCareerContinuationUserContext, readCareerAgentResourceContext } from "./agentTurnRuntime.server";
import { CareerReplyContinuation } from "./capabilities/runtime";
import { findCareerHandbook } from "./handbooks/registry";
import { getLlmUsageContext } from "@/lib/llm/usageContext";

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

test("the browser index identifies sibling applications without injecting their full reports into every task", async () => {
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
    assert.ok(!context.includes(execution.result.summary));
  }
  assert.ok(context.includes("Browser reports further input/action needed: yes"));
  assert.ok(context.includes("live browser stopped"));
  assert.ok(context.includes("2026-10-30 09:01"));
  assert.ok(!context.includes("PRIVATE_") && !context.includes("T00:01:02"));
});


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
