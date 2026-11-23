import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";

test("onboarding and a verified Gmail connection resume the owning chat with its ordinary model", async (t) => {
  const modules = Module as any;
  const originalLoad = modules._load;
  const calls: any[] = [];
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/career/background/server.ts")) {
      if (name === "../chatTurn") return { runCareerChatTurn: async (args: any) => { calls.push(args); } };
      if (name === "./companyIntro") return { readCompanyIntroContext: async () => "" };
      if (name === "./inbox") return { prepareCareerInboxContext: async () => ({ text: "", meetingScheduleVersions: {} }) };
      if (name === "../schedules/server") return { assertCareerSourceEventsCurrent: async () => {} };
      if (name === "@/lib/career/listCoverage" || name === "./prompt" || name === "./scheduledModel" || name === "./conclusions" || name === "../matching/workContext") return originalLoad.call(this, name, parent, ...args);
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
  const admin: any = { from: () => {
    const query: any = {
      select: () => query, eq: () => query, order: () => query,
      single: async () => ({ data: run, error: null }),
      limit: async () => ({ data: [], error: null }),
    };
    return query;
  } };
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
  await processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
  const gmail = calls[1];
  assert.equal(gmail.userMessage, null);
  assert.equal(gmail.applicationEvent, "Gmail read access was connected.");
  assert.equal(gmail.backgroundInvocation.replyChannel, "chat");
  assert.equal(gmail.backgroundInvocation.gmailConnectionGeneration, "read-connection-generation");
  assert.equal(gmail.backgroundInvocation.sourceMessageCursor, 0);
  assert.equal(gmail.assistantModel, undefined);
  assert.ok(gmail.proactiveContext.includes("Gmail"));
});
