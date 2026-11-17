import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database.types";
import { stackEnv } from "./env.mjs";

// Exercise actual PostgREST joins, document ownership and the chat context reader.
const withModel = process.argv.includes("--model");
const { env } = stackEnv();
const origin = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(["localhost", "127.0.0.1"].includes(origin.hostname));
Object.assign(process.env, {
  DATABASE_URL: env.DATABASE_URL,
  OPPORTUNITY_DATABASE_URL: env.OPPORTUNITY_DATABASE_URL,
  CAREER_ROLE_SEARCH_DATABASE_URL: env.CAREER_ROLE_SEARCH_DATABASE_URL,
  SUPABASE_URL: env.SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: origin.origin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: withModel ? env.OPENAI_API_KEY : "unused-local-test",
  ANTHROPIC_API_KEY: withModel ? env.ANTHROPIC_API_KEY : "",
});
const localFetch = globalThis.fetch;
const requests: unknown[] = [];
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  const dest = new URL(url);
  if (dest.origin !== origin.origin) {
    assert.ok(
      withModel &&
        ["api.openai.com", "api.anthropic.com"].includes(dest.hostname) &&
        /\/(responses|chat\/completions|messages|decisions)$/.test(
          dest.pathname
        ),
      "External service disabled in local history test"
    );
    requests.push(JSON.parse(String(init?.body ?? "{}")));
  }
  return localFetch(input, init);
};
const admin = createClient<Database>(
  origin.origin,
  env.SUPABASE_SERVICE_ROLE_KEY
);
const { executeTalentTool } =
  await import("../../src/lib/talentOnboarding/tools");
const { readCareerAgentResourceContext } =
  await import("../../src/lib/career/agentTurnRuntime.server");
const { recordSearchExecution } =
  await import("../../src/lib/career/resources/searchHistory");
const owner = randomUUID(),
  other = randomUUID(),
  first = randomUUID(),
  next = randomUUID();

async function call(
  userId: string,
  conversationId: string,
  name: string,
  input: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return (await executeTalentTool({
    name,
    input,
    channel: "chat",
    logging: false,
    persistTelemetry: false,
    context: {
      admin,
      userId,
      conversationId,
      resumeRequestId: randomUUID(),
      toolCallId: randomUUID(),
      ...extra,
    },
  })) as Record<string, any>;
}

try {
  await admin
    .from("talent_users")
    .insert([{ user_id: owner }, { user_id: other }])
    .throwOnError();
  await admin
    .from("talent_conversations")
    .insert([first, next].map((id) => ({ id, user_id: owner })))
    .throwOnError();
  const runId = randomUUID(),
    reply = `background:${runId}`,
    claim = randomUUID();
  const subject = "B2C community AI";
  const originalPurpose =
    "Look for possible teams building consumer community apps.";
  await admin
    .from("opportunity_discovery_run")
    .insert({
      id: runId,
      talent_id: owner,
      conversation_id: first,
      trigger: "career_schedule_due",
      run_mode: "immediate",
      status: "handed_off",
      target_recommendation_count: 0,
      trigger_payload: {
        runContract: "career_agent_v1",
        agentInvocation: { replyId: reply, sourceMessageCursor: 0 },
        sourceEvents: [
          { sourceKind: "schedule", instruction: originalPurpose },
        ],
      },
    })
    .throwOnError();
  const callId = randomUUID();
  const execution = {
    backgroundInvocation: { runId },
    toolCallId: callId,
    resumeRequestId: reply,
  };
  const scope = { source: "existing_internal_opportunities", query: subject };
  const invokeOriginal = () =>
    call(owner, first, "search_resources", scope, execution);
  const empty = await invokeOriginal();
  assert.deepEqual(empty.items, []);
  assert.equal(empty.set, undefined);
  const identity = {
    p_user_id: owner,
    p_conversation_id: first,
    p_reply_id: reply,
    p_claim_id: claim,
  };
  const rpc = admin.rpc.bind(admin) as any;
  const admitted = await rpc("claim_career_agent_turn", identity);
  assert.equal(admitted.error, null);
  assert.equal(admitted.data.accepted, true);
  const quiet = await rpc("finish_career_background_reply", {
    ...identity,
    p_run_id: runId,
  });
  assert.equal(quiet.data, true, quiet.error?.message);
  const finished = await admin
    .from("opportunity_discovery_run")
    .select("coverage,status")
    .eq("id", runId)
    .single()
    .throwOnError();
  assert.equal(
    (finished.data.coverage as Record<string, unknown>).agentOutcome,
    "no_send"
  );

  // No private document, search ID or message carries the query into the next chat.
  assert.equal(
    (
      await admin
        .from("talent_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", owner)
        .throwOnError()
    ).count,
    0
  );
  const index = await readCareerAgentResourceContext({
    admin,
    userId: owner,
    conversationId: next,
  });
  assert.ok(index.includes(subject) && index.includes("0 results"), index);
  let past = await call(owner, next, "read_talent_activity_events", {
    scope: "searches",
  });
  assert.equal(past.searches.length, 1);
  assert.equal(past.searches[0].result.count, 0);
  assert.equal(past.searches[0].request.purpose, originalPurpose);
  assert.ok(
    past.modelOutput.includes("existing_internal_opportunities") &&
      past.modelOutput.includes(subject) &&
      past.modelOutput.includes(originalPurpose)
  );
  const topic = await call(owner, next, "read_talent_activity_events", {
    scope: "searches",
    query: "community",
  });
  assert.equal(topic.searches[0].id, past.searches[0].id);
  assert.equal(
    (
      await call(other, randomUUID(), "read_talent_activity_events", {
        scope: "searches",
        query: "community",
      })
    ).searches.length,
    0
  );
  await invokeOriginal();
  assert.equal(
    (
      await call(owner, next, "read_talent_activity_events", {
        scope: "searches",
      })
    ).searches.length,
    1
  );
  await call(owner, first, "search_resources", {
    source: scope.source,
    query: "commuting allowance policy",
  });
  const newer = await readCareerAgentResourceContext({
    admin,
    userId: owner,
    conversationId: next,
  });
  assert.ok(
    newer.includes("commuting allowance policy") && !newer.includes(subject)
  );
  const mixedTerms = await call(owner, next, "read_talent_activity_events", {
    scope: "searches",
    query: "팀 커뮤니티 B2C AI",
  });
  assert.equal(mixedTerms.searches[0].id, past.searches[0].id);

  if (withModel) {
    // New evidence arrives after the quiet run. It contains no mention of that earlier search.
    await call(owner, next, "upsert_document", {
      action: "create",
      type: "markdown",
      title: "새로 받은 팀 소식",
      description: "11월 16일 커뮤니티 제품 팀에서 받은 근황.",
      markdown:
        "11월 16일 모꼬지메이커스의 제품 담당자가 보내온 소식. 취미 모임을 꾸리는 소비자 서비스에서 AI로 동네 행사를 찾아주는 기능을 공개했다. 설계자와 초기 사용자 리서치에 대해 이야기하고 싶다는 연락처도 남겼다. 채용 공고는 없었다.",
    });
    const facts = await readCareerAgentResourceContext({
      admin,
      userId: owner,
      conversationId: next,
    });
    const messages = [
      {
        role: "user" as const,
        content:
          "지난번에 찾아보던 팀들, 그 뒤에 새로 들어온 자료에서 볼 만한 게 있어요?",
      },
    ];
    const { resolveCareerChatTools } =
      await import("../../src/lib/career/llmTools");
    const { selectCareerPreloads } =
      await import("../../src/lib/career/capabilities/decisions");
    const { CareerCapabilityRuntime } =
      await import("../../src/lib/career/capabilities/runtime");
    const { runCareerChatAssistant } = await import("../../src/lib/career/llm");
    const { resolveCareerTextChatModel } =
      await import("../../src/lib/career/textChatModelConfig");
    const signal = AbortSignal.timeout(180_000);
    const tools = resolveCareerChatTools({
      channel: "chat",
      isOnboardingDone: true,
      responseLocale: "ko",
      hasActiveGmailIntegration: false,
    });
    const selection = await selectCareerPreloads({
      eligibleNames: new Set(tools.toolNames),
      eligibleTools: tools.tools,
      input: { messages, currentContext: facts },
      signal,
    });
    const runtime = new CareerCapabilityRuntime({
      mode: "progressive",
      eligibleTools: tools.tools,
      selection,
      abortSignal: signal,
      promptArgs: () => ({
        channel: "chat",
        isOnboardingDone: true,
        profile: null,
        structuredProfileText: "",
        talentContextSection: "",
        runtimeInstruction: facts,
        gmailCapability: "not_connected",
        currentPreferences: {
          preferredLocale: "ko",
          talentSettingStatus: "active",
          profileVisibility: "private",
        },
        requestTime: new Date(),
        timeZone: "Asia/Seoul",
      }),
    });
    const step = runtime.resolveStep(false),
      model = resolveCareerTextChatModel();
    const calls: Array<{
      name: string;
      input: Record<string, unknown>;
      output?: unknown;
    }> = [];
    const reply = await runCareerChatAssistant({
      primaryModel: model.model,
      openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort,
      responseLocale: "ko",
      messages,
      tools: step.tools,
      systemBlocks: step.systemBlocks,
      toolRuntime: runtime,
      stopAfterToolNames: tools.stopAfterToolNames,
      abortSignal: signal,
      usageLabel: "eval/career-search-continuity",
      executeTool: async (tool) => {
        const entry = {
          name: tool.name,
          input: tool.input,
          output: undefined as unknown,
        };
        calls.push(entry);
        const localRead =
          [
            "read_talent_activity_events",
            "search_resources",
            "list_documents",
            "read_document",
            "read_resources",
            "read_talent_context",
            "read_profile",
            "list_profiles",
          ].includes(tool.name) ||
          (tool.name === "manage_result_sets" &&
            ["list", "read"].includes(String(tool.input.action))) ||
          (tool.name === "manage_action_items" &&
            tool.input.operation === "list") ||
          (tool.name === "upsert_opportunities" &&
            tool.input.action === "read");
        if (!localRead) {
          entry.output =
            "This local fixture permits reading the synthetic owner's records only.";
          return { modelOutput: entry.output };
        }
        const result = await call(owner, next, tool.name, tool.input, {
          toolCallId: tool.callId,
        });
        entry.output = result.modelOutput ?? result;
        return result;
      },
    });
    const folder = `docs/evaluation/career-agent-autonomy/runs/${new Date().toISOString().replace(/[:.]/g, "-")}-search-continuity`;
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    writeFileSync(
      folder + "/review.json",
      JSON.stringify(
        {
          model: model.model,
          messages,
          localInput: facts,
          selection,
          calls,
          reply,
          requests,
        },
        null,
        2
      ),
      { mode: 0o600 }
    );
    console.log(
      "Observed model run",
      folder,
      JSON.stringify(calls.map((c) => [c.name, c.input])),
      reply
    );
  }

  // A failed search must not read like a completed search with zero results.
  await assert.rejects(
    call(owner, next, "search_resources", {
      source: "web",
      query: subject,
      cursor: "2",
    })
  );
  past = await call(owner, next, "read_talent_activity_events", {
    scope: "searches",
    query: "community",
  });
  assert.equal(past.searches[0].status, "failed");
  assert.equal(past.searches[0].result.count, null);
  assert.ok(past.searches[0].result.failure);
  // A zero-result mailbox query has private scope even when no message reference exists.
  const mailbox = await admin
    .from("talent_integrations")
    .insert({
      talent_id: owner,
      provider: "gmail",
      status: "active",
      composio_connected_account_id: randomUUID(),
    })
    .select("*")
    .single()
    .throwOnError();
  const grant = (
    mailbox.data as unknown as { career_mail_sync: { generation: string } }
  ).career_mail_sync.generation;
  const emailScope = { query: "from:private@example.test" };
  const mailContext = { admin, userId: owner, conversationId: first };
  await recordSearchExecution(
    "search_connected_gmail",
    emailScope,
    mailContext,
    { result: { status: "ok", emails: [], mailboxGeneration: grant } }
  );
  assert.equal(
    (
      await call(owner, next, "read_talent_activity_events", {
        scope: "searches",
        query: "private@example.test",
      })
    ).searches[0].result.count,
    0
  );
  await admin
    .from("talent_integrations")
    .delete()
    .eq("talent_id", owner)
    .eq("provider", "gmail")
    .throwOnError();
  assert.equal(
    (
      await call(owner, next, "read_talent_activity_events", {
        scope: "searches",
        query: "private@example.test",
      })
    ).searches.length,
    0
  );
  const stored = await admin
    .from("talent_external_operations")
    .select("request,result")
    .eq("user_id", owner)
    .eq("kind", "resource_search")
    .throwOnError();
  assert.ok(!JSON.stringify(stored.data).includes("private@example.test"));
  await assert.rejects(
    recordSearchExecution("search_connected_gmail", emailScope, mailContext, {
      result: { status: "ok", emails: [], mailboxGeneration: grant },
    })
  );
  console.log(
    "A quiet scheduled page search returned zero and sent nothing. A fresh chat recovered its scope and purpose with no note or ID, including after an unrelated search. Topic ranking, owner isolation, idempotency, failed search, and mailbox revocation checks passed."
  );
} finally {
  await admin
    .from("talent_users")
    .delete()
    .in("user_id", [owner, other])
    .throwOnError();
}
