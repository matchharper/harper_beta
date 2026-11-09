import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";

test("onboarding continues in its owning chat with the conversation model and no scheduled preparation", async (t) => {
  const modules = Module as any;
  const originalLoad = modules._load;
  const calls: any[] = [];
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/career/background/server.ts")) {
      if (name === "../chatTurn") return { runCareerChatTurn: async (args: any) => { calls.push(args); } };
      if (name === "./companyIntro") return { readCompanyIntroContext: async () => "" };
      if (name === "./inbox") return { prepareCareerInboxContext: async () => ({ text: "", meetingScheduleVersions: {} }) };
      if (name === "../schedules/server") return { assertCareerSourceEventsCurrent: async () => {} };
      if (name === "./prompt") return { renderCareerBackgroundInvocation: () => "Scheduled work" };
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
    trigger_payload: { runContract: "career_agent_v1", agentInvocation: { replyId: "background:run" }, sourceEvents: [] as any[] },
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
});
