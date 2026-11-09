import assert from "node:assert/strict";
import test from "node:test";
import { openrouterClient } from "@/lib/llm/llm";
import { runOrgAgentCompletion, runOrgAgentToolLoop } from "./chat";
import { ORG_AGENT_GEMINI_FLASH_MODEL } from "./modelConfig";
import { createOrgAgentTextStream } from "./textStream";
import { OrgAgentToolInputError } from "./toolExecution";
import { AgentContactSupersededError, assertAgentContactSource } from "@/lib/agentContacts/store";
import type { Query } from "@/lib/career/matching/internalScoring/database";

function fixture(): Parameters<typeof runOrgAgentToolLoop>[0] {
  return {
    actorId: "actor", actorLabel: "팀원", currentUserMessageId: 1,
    admin: new Proxy({}, { get(_target, key) {
      if (key === Symbol.for("harper.companyAgentScope")) return undefined;
      throw Error("Unexpected DB access");
    } }),
    conversation: { id: "conversation", role_id: null, company_workspace_id: "workspace" },
    context: {
      workspace: { workspaceId: "workspace" }, roles: [], companyText: "합성 회사",
      rolesText: "-", conversationText: "-", conversationMessages: [], summariesText: "-",
      recentContactsText: "-", recentRecommendationsText: "-", contextNotesText: "-",
      completeRoleRequestIds: [], defaultLongTextObservations: [],
      inProgressRoleCreationsText: "-", pendingUpdateText: "-", recentToolContextText: "-",
    },
    mentions: [], model: ORG_AGENT_GEMINI_FLASH_MODEL, readAudience: "company_safe",
    scopeKey: "stream-test", source: "chat", slackThreadId: null,
    user: { id: "actor" }, userMessage: "후보자 현황을 알려줘",
  } as unknown as Parameters<typeof runOrgAgentToolLoop>[0];
}

const chunk = (delta: object, finish_reason: string | null = null) => ({
  choices: [{ delta, finish_reason }],
});

test("durable company events propagate execution failures instead of completing silently", async () => {
  let completions = 0;
  const failure = new Error("Company role permission unavailable");
  await assert.rejects(runOrgAgentToolLoop({
    ...fixture(), allowSilentCompletion: true, throwOnToolExecutionError: true,
  }, {
    complete: async (args) => {
      completions++;
      return { model: args.model, response: { choices: [{ message: {
        content: "", tool_calls: [{ id: "read-1", type: "function", function: { name: "get_talents", arguments: "{}" } }],
      } }] } };
    },
    executeTool: async () => { throw failure; },
  }), (error) => error === failure);
  assert.equal(completions, 1);
});

test("durable events still let the original model correct input errors and finish quietly", async () => {
  let completions = 0;
  let executions = 0;
  const result = await runOrgAgentToolLoop({
    ...fixture(), allowSilentCompletion: true, throwOnToolExecutionError: true,
  }, {
    complete: async (args) => {
      completions++;
      return { model: args.model, response: { choices: [{ message: {
        content: "", ...(completions < 3 ? { tool_calls: [{ id: `read-${completions}`, type: "function", function: { name: "get_talents", arguments: "{}" } }] } : {}),
      } }] } };
    },
    executeTool: async () => {
      if (++executions === 1) throw new OrgAgentToolInputError("Exact Role required");
      return { items: [] };
    },
  });
  assert.equal(result.reply, "");
  assert.equal(executions, 2);
  assert.equal(completions, 3);
});

test("candidate scope rejection reaches the next provider request with authorized references", async () => {
  const original = openrouterClient.chat.completions.create;
  const bodies: any[] = [];
  const executions: string[] = [];
  let pairChecks = 0;
  const source = { kind: "company_event" as const, workspaceId: "workspace", roleId: "role", jobId: "job", leaseOwner: "lease" };
  const query: Query = async (sql, params) => {
    if (sql.includes("FROM public.company_agent_web_action_jobs")) return [{ id: "job", action_name: "agent_contact_received", action_context: { introductionRootId: "root" } }];
    if (sql.includes("FROM public.agent_contact_messages")) return [{ id: "root", talent_id: "authorized-talent", role_id: "role", company_workspace_id: "workspace", recommendation_id: "recommendation" }];
    if (sql.includes("JOIN public.talent_opportunity_recommendation rec")) {
      pairChecks++;
      assert.equal(params?.[1], "authorized-talent");
      return [{ role_id: "role", profile_visibility: "share" }];
    }
    if (sql.includes("FROM public.company_roles")) return [{ role_id: "role" }];
    throw Error(`Unexpected query: ${sql}`);
  };
  (openrouterClient.chat.completions as any).create = async (body: any) => {
    bodies.push(structuredClone(body));
    if (bodies.length === 2) {
      const error = body.messages.find((m: any) => m.role === "tool" && m.tool_call_id === "scope-1");
      assert.ok(error, "the original model must receive the rejected call's result");
      for (const fact of ["does not authorize another candidate relationship", "Requested talentId=other-talent", "talentId=authorized-talent", "roleId=role", "introductionRootId=root"])
        assert.ok(error.content.includes(fact), fact);
    }
    return { choices: [{ message: bodies.length < 3 ? {
      content: "", tool_calls: [{ id: `scope-${bodies.length}`, type: "function", function: {
        name: "read_agent_messages", arguments: JSON.stringify({ roleId: "role", talentId: bodies.length === 1 ? "other-talent" : "authorized-talent" }),
      } }],
    } : { content: "" } }] };
  };
  try {
    const result = await runOrgAgentToolLoop({
      ...fixture(), allowSilentCompletion: true, throwOnToolExecutionError: true,
      initialCapabilities: ["agent_correspondence"],
    }, {
      executeTool: async args => {
        const { talentId } = args.input as { talentId: string };
        executions.push(talentId);
        await assertAgentContactSource(query, source, "role", talentId);
        return { messages: [] };
      },
    });
    assert.equal(result.reply, "");
    assert.deepEqual(executions, ["other-talent", "authorized-talent"]);
    assert.equal(pairChecks, 1, "the rejected candidate never passes the relationship guard");
    assert.equal(bodies.length, 3);
    assert.deepEqual(result.state.toolResults.map(r => r.status), ["error"]);
    assert.ok(bodies[2].messages.some((m: any) => m.role === "tool" && m.tool_call_id === "scope-2"));
  } finally {
    openrouterClient.chat.completions.create = original;
  }
});

test("a stale company event remains a terminating control error", async () => {
  let completions = 0;
  await assert.rejects(runOrgAgentToolLoop({
    ...fixture(), allowSilentCompletion: true, throwOnToolExecutionError: true,
  }, {
    complete: async args => {
      completions++;
      return { model: args.model, response: { choices: [{ message: {
        content: "", tool_calls: [{ id: "stale", type: "function", function: { name: "get_talents", arguments: "{}" } }],
      } }] } };
    },
    executeTool: async () => assertAgentContactSource(async () => [], {
      kind: "company_event", workspaceId: "workspace", roleId: "role", jobId: "job", leaseOwner: "expired",
    }, "role", "talent"),
  }), AgentContactSupersededError);
  assert.equal(completions, 1);
});

test("web loop emits the first answer token before completion, preserves signatures and executes tools once", { timeout: 5_000 }, async () => {
  const original = openrouterClient.chat.completions.create;
  const bodies: any[] = [];
  const events: Array<[string, any]> = [];
  const textStream = createOrgAgentTextStream((event, data) => events.push([event, data]));
  let release!: () => void;
  let firstToken!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const arrived = new Promise<void>((resolve) => { firstToken = resolve; });
  const signature = { google: { thought_signature: "opaque-signature" } };
  let executions = 0;
  (openrouterClient.chat.completions as any).create = async (body: any) => {
    bodies.push(body);
    return (async function* () {
      if (bodies.length === 1) {
        yield { provider: "Google", ...chunk({ tool_calls: [{ index: 0, id: "read-1", type: "function", extra_content: signature, function: { name: "get_talents", arguments: "{" } }] }) };
        yield chunk({ tool_calls: [{ index: 0, function: { arguments: "}" } }] }, "tool_calls");
      } else {
        yield chunk({ content: "현재 " });
        firstToken();
        await waiting;
        yield chunk({ content: "후보자는 없어요." }, "stop");
        yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 } };
      }
    })();
  };
  let completed = false;
  try {
    const pending = runOrgAgentToolLoop({
      ...fixture(), onTextDelta: textStream.append, onTextReset: () => textStream.replace(""),
    }, { executeTool: async () => { executions++; return { items: [] }; } }).then((result) => {
      completed = true;
      return result;
    });
    await arrived;
    assert.equal(completed, false);
    assert.deepEqual(events, [["text_delta", { delta: "현재 " }]]);
    release();
    const result = await pending;
    textStream.replace(result.reply);
    assert.equal(result.reply, "현재 후보자는 없어요.");
    assert.equal(result.usage.outputTokens, 8);
    assert.equal(executions, 1);
    assert.equal(bodies.length, 2);
    assert.ok(bodies.every((body) => body.stream === true));
    assert.deepEqual(bodies[1].provider, { only: ["google-vertex"], allow_fallbacks: false });
    assert.deepEqual(bodies[1].messages.find((m: any) => m.role === "assistant").tool_calls[0].extra_content, signature);
    assert.deepEqual(events, [["text_delta", { delta: "현재 " }], ["text_delta", { delta: "후보자는 없어요." }]]);
  } finally {
    release();
    openrouterClient.chat.completions.create = original;
  }
});

test("successive web messages are committed before each tool and do not duplicate the final bubble", async () => {
  const events: Array<[string, any]> = [];
  const stream = createOrgAgentTextStream((event, data) => events.push([event, data]));
  let step = 0;
  let progress = 0;
  const result = await runOrgAgentToolLoop({
    ...fixture(), onTextDelta: stream.append, onTextReset: () => stream.replace(""),
    onVisibleProgress: async ({ text }) => {
      progress++;
      stream.replace(text);
      events.push(["assistant_message", { content: text }]);
      stream.committed();
      return true;
    },
  }, {
    complete: async (args) => {
      const text = ["확인할게요.", "추가 조회 중", "확인했어요."][step++];
      await args.onTextDelta?.(text);
      return { model: args.model, response: { choices: [{ message: {
        content: text,
        ...(step < 3 ? { tool_calls: [{ id: `read-${step}`, type: "function", function: { name: "get_talents", arguments: "{}" } }] } : {}),
      } }] } };
    },
    executeTool: async () => ({ items: [] }),
  });
  stream.replace(result.reply);
  assert.equal(progress, 2);
  assert.deepEqual(events, [
    ["text_delta", { delta: "확인할게요." }],
    ["assistant_message", { content: "확인할게요." }],
    ["text_delta", { delta: "추가 조회 중" }],
    ["assistant_message", { content: "추가 조회 중" }],
    ["text_delta", { delta: "확인했어요." }],
  ]);
  // Server-authoritative exact presentation replaces the live text atomically.
  stream.replace(`${result.reply}\n\n저장된 초안`);
  assert.deepEqual(events.at(-1), ["text_replace", { text: "확인했어요.\n\n저장된 초안" }]);
});

test("provider errors, exhausted budgets and truncated streams cannot become successful answers or duplicate partial text", async () => {
  const original = openrouterClient.chat.completions.create;
  try {
    for (const [lastChunk, expected] of [
      [chunk({}, "length"), /exhausted its output budget/],
      [{ choices: [{ error: { message: "provider failed", code: 400 }, finish_reason: "error" }] }, /provider failed/],
      [null, /ended before completion/],
    ] as const) {
      let calls = 0;
      const deltas: string[] = [];
      (openrouterClient.chat.completions as any).create = async () => {
        calls++;
        return (async function* () {
          yield chunk({ content: "부분 응답" });
          if (lastChunk) yield lastChunk;
        })();
      };
      await assert.rejects(runOrgAgentCompletion({
        allowTools: false, maxTokens: 100, messages: [{ role: "user", content: "hello" }],
        model: ORG_AGENT_GEMINI_FLASH_MODEL, onTextDelta: (delta) => { deltas.push(delta); },
      }), expected);
      assert.equal(calls, 1);
      assert.deepEqual(deltas, ["부분 응답"]);
    }
  } finally {
    openrouterClient.chat.completions.create = original;
  }
});

test("a long chain executes beyond thirty calls with compact working reads and an intact original transcript", async () => {
  let step = 0;
  let executions = 0;
  let sawCompaction = false;
  const result = await runOrgAgentToolLoop({ ...fixture(), initialCapabilities: ["web_research"] }, {
    complete: async args => {
      sawCompaction ||= args.messages.some(message => typeof message.content === "string" && message.content.includes("context_detail_complete=false"));
      for (const message of args.messages) {
        for (const call of message.tool_calls ?? []) assert.ok(args.messages.some(result => result.role === "tool" && result.tool_call_id === call.id));
      }
      step++;
      return { model: args.model, response: { choices: [{ message: step <= 36
        ? { content: "", tool_calls: [{ id: `long-${step}`, type: "function", function: { name: "open_url", arguments: JSON.stringify({ url: `https://example.com/${step}` }) } }] }
        : { content: "전체 확인을 마쳤어요." } }] } };
    },
    executeTool: async args => {
      executions++;
      const input = args.input as { url: string };
      return { url: input.url, resolvedUrl: input.url, markdown: "source evidence ".repeat(2500), markdownCharCount: 40_000 };
    },
  });
  assert.equal(executions, 36);
  assert.equal(step, 37);
  assert.equal(sawCompaction, true);
  assert.equal(result.reply, "전체 확인을 마쳤어요.");
  assert.equal(result.toolTranscript.filter(message => message.role === "tool").length, 36);
  assert.ok(result.toolTranscript.filter(message => message.role === "tool").every(message => typeof message.content === "string" && message.content.includes("source evidence")));
});

test("the loop obeys an actual cancellation before another model call", async () => {
  const controller = new AbortController();
  let modelCalls = 0;
  await assert.rejects(runOrgAgentToolLoop({ ...fixture(), signal: controller.signal }, {
    complete: async args => {
      modelCalls++;
      return { model: args.model, response: { choices: [{ message: { content: "", tool_calls: [{ id: "cancel-read", type: "function", function: { name: "get_talents", arguments: "{}" } }] } }] } };
    },
    executeTool: async () => { controller.abort(); return { items: [] }; },
  }), { name: "AbortError" });
  assert.equal(modelCalls, 1);
});
