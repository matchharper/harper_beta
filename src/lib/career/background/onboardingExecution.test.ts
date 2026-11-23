import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";

test("onboarding and a verified Gmail connection resume the owning chat with its ordinary model", async (t) => {
  const modules = Module as any;
  const originalLoad = modules._load;
  const calls: any[] = [];
  class CareerSourceChangedError extends Error {}
  const source = { changed: false };
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/career/background/server.ts")) {
      if (name === "../chatTurn") return { runCareerChatTurn: async (args: any) => { calls.push(args); } };
      if (name === "./companyIntro") return { readCompanyIntroContext: async () => "" };
      if (name === "./inbox") return { prepareCareerInboxContext: async () => ({ text: "", meetingScheduleVersions: {} }) };
      if (name === "../schedules/server") return { CareerSourceChangedError, finishCareerSourceEvents: async () => {},
        assertCareerSourceEventsCurrent: async () => { if (source.changed) throw new CareerSourceChangedError("Gmail connection changed"); } };
      if (name === "@/lib/career/listCoverage" || name === "./prompt" || name === "./scheduledModel" || name === "./conclusions" || name === "../matching/workContext" || name === "../browser/submissionReceipt" || name === "./gmailReview") return originalLoad.call(this, name, parent, ...args);
      if (name === "../companies/preparation") return {
        prepareFollowedCompanies: async () => ({ ready: true }), shouldPrepareFollowedCompanies: () => false,
      };
      if (name === "@/lib/llm/toolExecution") return {
        runToolCall: (work: () => unknown) => work(), unwrapToolCall: (value: unknown) => value,
      };
      if (name === "@/lib/llm/modelConfig") return { GPT_6_LUNA_MODEL };
      return {};
    }
    return originalLoad.call(this, name, parent, ...args);
  });
  const { processCareerBackgroundRun } = require("./server");
  const run = {
    id: "run", talent_id: "owner", conversation_id: "conversation", status: "handed_off",
    trigger: "conversation_completed",
    trigger_payload: { gmailConnectionGeneration: undefined as string | undefined, runContract: "career_agent_v1", agentInvocation: { replyId: "background:run" }, sourceEvents: [] as any[] },
  };
  // Chat state the Gmail review reads before it starts.
  const chat = { requests: [] as unknown[], recentMessages: [] as unknown[], openForms: [] as unknown[], latestUserMessageId: 41,
    browserRuns: [] as unknown[], runtime: null as unknown };
  const updates: any[] = [];
  const queries: { table: string; eq: Record<string, unknown>; is: Record<string, unknown>; since: Record<string, number> }[] = [];
  const rpcs: string[] = [];
  const admin: any = {
    from: (table: string) => {
      const filters = { table, eq: {} as Record<string, unknown>, is: {} as Record<string, unknown>, since: {} as Record<string, number> };
      queries.push(filters);
      const query: any = {
        select: () => query, neq: () => query, order: () => query,
        eq: (column: string, value: unknown) => { filters.eq[column] = value; return query; },
        is: (column: string, value: unknown) => { filters.is[column] = value; return query; },
        gte: (column: string, value: string) => { filters.since[column] = Date.parse(value); return query; },
        single: async () => ({ data: run, error: null }),
        maybeSingle: async () => ({ data: table === "talent_agent_runtime" && chat.runtime ? { state: chat.runtime } : null, error: null }),
        limit: async () => ({ error: null, data: table === "talent_external_operations"
          ? (filters.eq.kind === "browser_run" ? chat.browserRuns : chat.requests)
          : table === "talent_messages" ? (filters.since.created_at ? chat.recentMessages : [{ id: chat.latestUserMessageId }]) : [] }),
        update: (values: unknown) => {
          updates.push(values);
          const write: any = { eq: () => write, then: (resolve: (value: unknown) => void) => resolve({ error: null }) };
          return write;
        },
      };
      return query;
    },
    rpc: async (name: string) => { rpcs.push(name); return { data: name === "read_open_career_forms" ? chat.openForms : null, error: null }; },
  };
  await processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
  assert.equal(calls.length, 1);
  const invocation = calls[0];
  assert.equal(invocation.userMessage, null);
  assert.equal(invocation.conversationId, "conversation");
  assert.equal(invocation.assistantModel, undefined);
  assert.equal(invocation.assistantOpenAIResponsesReasoningEffort, undefined);
  assert.equal(invocation.backgroundInvocation.replyChannel, "chat");
  assert.equal(invocation.backgroundInvocation.runId, "run");
  assert.equal(invocation.suppressOnboarding, true);
  await assert.rejects(processCareerBackgroundRun({ admin, userId: "other", conversationId: "conversation", runId: "run" }), /owner mismatch/);
  assert.equal(calls.length, 1);
  run.trigger = "gmail_connected";
  run.trigger_payload.gmailConnectionGeneration = "read-connection-generation";
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const review = () => processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
  Object.assign(run, { created_at: minutesAgo(1), coverage: {} });

  // While the person uses the chat, the inbox review does not start and holds nothing.
  chat.requests = [{ id: "application-invocation" }];
  queries.length = 0;
  const checkedAt = Date.now();
  await review();
  assert.equal(calls.length, 1);
  // A request counts from when the person made it, since the dispatch scan touches unfinished requests every
  // minute; only the person's own requests count, not delegated work.
  const ago = (filters: (typeof queries)[number] | undefined, column: string) => Math.round((checkedAt - (filters?.since[column] ?? 0)) / 60_000);
  const requestQuery = queries.find(query => query.eq.kind === "career_invocation");
  assert.equal(requestQuery?.is.parent_id, null);
  assert.equal(ago(requestQuery, "created_at"), 60);
  assert.equal(requestQuery?.since.updated_at, undefined);
  assert.equal(ago(queries.find(query => query.table === "talent_messages" && query.since.created_at), "created_at"), 10);
  // A code screen is only looked for while its browser can still be open.
  assert.equal(ago(queries.find(query => query.eq.kind === "browser_run"), "updated_at"), 15);
  chat.requests = [];
  chat.recentMessages = [{ id: 40 }];
  await review();
  chat.recentMessages = [];
  chat.openForms = [{ id: 39, created_at: minutesAgo(20) }];
  await review();
  assert.equal(calls.length, 1);
  assert.equal(updates.length, 0);

  // A form left unanswered for over an hour no longer counts as use, so the quiet chat gets its review.
  chat.openForms = [{ id: 39, created_at: minutesAgo(61) }];
  await review();
  assert.equal(calls.length, 2);
  const gmail = calls[1];
  assert.equal(gmail.userMessage, null);
  assert.equal(gmail.applicationEvent, "Gmail read access was connected.");
  assert.equal(gmail.backgroundInvocation.replyChannel, "chat");
  assert.equal(gmail.backgroundInvocation.gmailConnectionGeneration, "read-connection-generation");
  // Messages answered while it waited are not handed to it as new input.
  assert.equal(gmail.backgroundInvocation.sourceMessageCursor, 41);
  assert.equal(updates[0].coverage.gmailReviewCursor, 41);
  assert.ok(updates[0].coverage.gmailReviewStartedAt);
  assert.equal(gmail.assistantModel, undefined);
  assert.ok(gmail.proactiveContext.includes("Gmail"));

  // Once started, its own messages never hold it back when it continues.
  Object.assign(run, { coverage: updates[0].coverage });
  chat.recentMessages = [{ id: 42 }];
  await review();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].backgroundInvocation.sourceMessageCursor, 41);
  assert.equal(updates.length, 1);

  // An application waiting for an emailed code gets the review at once, even while the chat is in use.
  Object.assign(run, { coverage: {}, created_at: minutesAgo(1) });
  chat.recentMessages = [{ id: 42 }];
  chat.browserRuns = [{ result: { verificationCode: "phone", submitted: "no" } }];
  await review();
  assert.equal(calls.length, 3);
  chat.browserRuns = [{ result: { verificationCode: "email", submitted: "no" } }];
  await review();
  assert.equal(calls.length, 4);
  chat.browserRuns = [];
  chat.recentMessages = [];

  // A review whose turn began before its start was recorded continues instead of waiting for its own messages.
  Object.assign(run, { coverage: {}, created_at: minutesAgo(5) });
  chat.recentMessages = [{ id: 43 }];
  chat.runtime = { checkpoints: { "background:run": { checkpointId: "saved" } } };
  await review();
  assert.equal(calls.length, 5);
  chat.runtime = null;

  // A Gmail disconnected or replaced while the review waits cancels it at once.
  Object.assign(run, { coverage: {}, created_at: minutesAgo(5) });
  source.changed = true;
  await review();
  assert.equal(calls.length, 5);
  assert.equal(rpcs.at(-1), "cancel_career_background_run");
  source.changed = false;
  chat.recentMessages = [];

  // A chat that never goes quiet still gets the review three hours after the connection.
  Object.assign(run, { coverage: {}, created_at: minutesAgo(3 * 60 - 1) });
  chat.requests = [{ id: "busy-invocation" }];
  await review();
  assert.equal(calls.length, 5);
  Object.assign(run, { coverage: {}, created_at: minutesAgo(3 * 60 + 1) });
  await review();
  assert.equal(calls.length, 6);
});
