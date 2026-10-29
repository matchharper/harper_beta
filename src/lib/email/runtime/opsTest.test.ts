import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { opsEmailTestInput } from "./opsTest";
import { serializeToolResultForModel } from "@/lib/llm/toolError";
import { EMAIL_ASSISTANT_MODEL, emailAssistantModel } from "./model";

let processEmailReply: typeof import("./reply").processEmailReply;
let turns = 0;
let lastTurn: any;
const response = "역할에 맞게 이력서를 준비했습니다. [이력서](https://example.com/resume)";

before(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "unit",
    SUPABASE_SERVICE_ROLE_KEY: "unit", OPENAI_API_KEY: "unit", OPENROUTER_API_KEY: "unit",
    EMAIL_REPLY_FROM_EMAIL: "Harper <hello@example.com>",
  });
  const mod = Module as any, original = mod._load;
  mod._load = function (name: string, parent: any, main: boolean) {
    if (name === "server-only") return {};
    if (name === "@/lib/career/chatTurn") return {
      runCareerChatTurn: async (args: any) => {
        turns++;
        lastTurn = args;
        assert.equal(args.userId, "talent");
        assert.equal(args.assistantMessageType, "mail");
        const blocks = args.adapter.adaptPromptBlocks([]);
        const text = blocks.map((b: any) => b.text).join("\n");
        assert.match(text, /communicating through Email/);
        assert.match(text, /Subject: 지원 문의/);
        assert.match(text, /Ops email test/);
        assert.doesNotMatch(text, /\{"subject"/);
        const selection = args.adapter.adaptTools({ tools: [], toolNames: [], stopAfterToolNames: [] });
        assert.ok(selection.toolNames.includes("ready_for_role"));
        const blocked = await args.adapter.executeTool({
          name: "contact_company", input: {},
          executeDefault: async () => { throw new Error("External executor must not run"); },
        });
        const providerResult = serializeToolResultForModel(blocked);
        assert.match(providerResult, /ops_email_test_external_effect_disabled/);
        assert.ok(!providerResult.trim().startsWith("{"));
        await args.adapter.beforeAssistantFinalization();
        return args.adapter.persistAssistant({ content: response, notices: [] });
      },
    };
    if (parent?.filename.endsWith("/runtime/reply.ts") && name === "./context")
      return { loadEmailReferenceContext: async () => ({ text: "Role: engineer", internalConnectionReply: false }) };
    if (parent?.filename.endsWith("/runtime/reply.ts") && name === "./onboarding")
      return new Proxy({}, { get: () => () => { throw new Error("Test must not schedule signup/onboarding delivery"); } });
    return original.call(this, name, parent, main);
  };
  try { ({ processEmailReply } = await import("./reply")); }
  finally { mod._load = original; }
});

function fixture() {
  const job: any = {
    id: "job", inbound_event_id: "event", kind: "ops_email_test", talent_id: "talent",
    conversation_id: "conversation", worker_target: "vercel_queue", status: "processing", locked_by: "owner",
    metadata: { opsEmailTest: { actorId: "operator", email: {
      from: "candidate@example.com", to: ["ops-test@reply.matchharper.com"], subject: "지원 문의", text: "지원해 주세요.",
    } } },
  };
  const tables: Record<string, any[]> = {
    email_reply_jobs: [job], email_inbound_events: [{ id: "event", provider_email_id: "never-fetch" }],
    talent_users: [{ user_id: "talent", email: "candidate@example.com" }],
    talent_conversations: [{ id: "conversation", user_id: "talent" }],
    talent_setting: [{ user_id: "talent", is_onboarding_done: true }], talent_messages: [],
    career_email_messages: [], talent_simulate_application: [],
  };
  const admin: any = {
    from(table: string) {
      assert.ok(table in tables, table);
      let patch: any;
      const filters: Array<(row: any) => boolean> = [];
      const run = () => {
        const rows = tables[table].filter(row => filters.every(f => f(row)));
        if (patch) rows.forEach(row => Object.assign(row, patch));
        return { data: rows, error: null };
      };
      const q: any = {
        select: () => q, contains: () => q, order: () => q, limit: () => q,
        eq: (key: string, value: unknown) => { filters.push(row => String(row[key]) === String(value)); return q; },
        update: (value: any) => { patch = value; return q; },
        maybeSingle: async () => { const result = run(); return { ...result, data: result.data[0] ?? null }; },
        then: (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject),
      };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === "write_application_activity") return { data: null, error: null };
      assert.equal(name, "persist_email_runtime_message_v1", "No sent/received email audit should be recorded");
      const key = args.p_role === "user" ? "user_message_id" : "assistant_message_id";
      let message = tables.talent_messages.find(row => row.id === job[key]);
      if (!message) {
        message = { id: tables.talent_messages.length + 1, user_id: args.p_talent_id,
          conversation_id: args.p_conversation_id, role: args.p_role, content: args.p_content };
        tables.talent_messages.push(message);
        job[key] = message.id;
      }
      Object.assign(job.metadata, args.p_metadata);
      return { data: message, error: null };
    },
  };
  return { admin, job, tables };
}

test("Ops uses the email adapter, persists both sides, renders links and never calls a mail provider, including recovery", async () => {
  const f = fixture();
  const originalFetch = globalThis.fetch;
  const dryRun = process.env.EMAIL_REPLY_DRY_RUN;
  delete process.env.EMAIL_REPLY_DRY_RUN;
  globalThis.fetch = async () => { throw new Error("No external HTTP call authorized"); };
  try {
    await processEmailReply(f.admin, f.job, "owner");
    assert.equal(f.job.status, "skipped");
    assert.equal(f.job.skip_reason, "ops_email_test");
    assert.equal(f.job.resend_email_id, undefined);
    assert.equal(f.tables.talent_messages.length, 2);
    assert.equal(f.tables.talent_messages[1].content, response);
    assert.match(f.job.metadata.delivery.html, /href="https:\/\/example.com\/resume"/);
    assert.equal(turns, 1);
    assert.equal(lastTurn.assistantModel, EMAIL_ASSISTANT_MODEL);
    Object.assign(f.job, { status: "processing", locked_by: "owner" });
    await processEmailReply(f.admin, f.job, "owner");
    assert.equal(turns, 1);
    assert.equal(f.tables.talent_messages.length, 2);
    assert.equal(f.job.skip_reason, "ops_email_test");
  } finally {
    globalThis.fetch = originalFetch;
    if (dryRun === undefined) delete process.env.EMAIL_REPLY_DRY_RUN;
    else process.env.EMAIL_REPLY_DRY_RUN = dryRun;
  }
});

test("Ops forwards a custom model to the shared reply turn and preserves tool and delivery isolation", async () => {
  const f = fixture();
  f.job.metadata.opsEmailTest.model = "vendor/custom-reply-model";
  await processEmailReply(f.admin, f.job, "owner");
  assert.equal(lastTurn.assistantModel, "vendor/custom-reply-model");
  assert.equal(f.job.skip_reason, "ops_email_test");
  assert.equal(f.job.resend_email_id, undefined);
});

test("model overrides apply only to Ops tests, with existing reasoning defaults for known models", () => {
  const metadata = { opsEmailTest: { model: "gpt-6-luna" } };
  assert.equal(emailAssistantModel({ kind: "ops_email_test", metadata }).openAIResponsesReasoningEffort, "xhigh");
  assert.equal(emailAssistantModel({ kind: "reply", metadata }).primaryModel, EMAIL_ASSISTANT_MODEL);
  assert.equal(emailAssistantModel({ kind: "ops_email_test", metadata: {} }).primaryModel, EMAIL_ASSISTANT_MODEL);
  assert.equal(emailAssistantModel().primaryModel, EMAIL_ASSISTANT_MODEL);
});

test("only the server-owned test kind enables test transport; malformed test jobs fail closed", () => {
  assert.equal(opsEmailTestInput({ kind: "reply", metadata: { opsEmailTest: { email: { text: "fake" } } } }), null);
  assert.throws(() => opsEmailTestInput({ kind: "ops_email_test", metadata: {} }), /Invalid Ops/);
});
