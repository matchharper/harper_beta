import assert from "node:assert/strict";
import test from "node:test";
import { openrouterClient } from "@/lib/llm/llm";
import { runOrgAgentCompletion, runOrgAgentToolLoop } from "./chat";
import { ORG_AGENT_GEMINI_FLASH_MODEL } from "./modelConfig";
import { createOrgAgentTextStream } from "./textStream";

function fixture(): Parameters<typeof runOrgAgentToolLoop>[0] {
  return {
    actorId: "actor", actorLabel: "팀원", currentUserMessageId: 1,
    admin: new Proxy({}, { get() { throw Error("Unexpected DB access"); } }),
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

test("progress and final bubbles do not duplicate, and unsaved tool prose is cleared", async () => {
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
  assert.equal(progress, 1);
  assert.deepEqual(events, [
    ["text_delta", { delta: "확인할게요." }],
    ["assistant_message", { content: "확인할게요." }],
    ["text_delta", { delta: "추가 조회 중" }],
    ["text_replace", { text: "" }],
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
