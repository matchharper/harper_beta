import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { GPT_6_LUNA_MODEL } from "@/lib/llm/modelConfig";

test("only scheduled background runs override the conversation model with high reasoning", async (t) => {
  const modules = Module as any;
  const originalLoad = modules._load;
  const calls: any[] = [];
  t.mock.method(modules, "_load", function (this: unknown, name: string, parent: any, ...args: any[]) {
    if (parent?.filename?.endsWith("/career/background/server.ts")) {
      if (name === "../chatTurn") return { runCareerChatTurn: async (args: any) => { calls.push(args); } };
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
    trigger: "career_schedule_due",
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
  const previous = process.env.CAREER_SCHEDULED_AGENT_MODEL;
  try {
    for (const configured of [undefined, "  ", " claude-sonnet-5-5 "]) {
      if (configured === undefined) delete process.env.CAREER_SCHEDULED_AGENT_MODEL;
      else process.env.CAREER_SCHEDULED_AGENT_MODEL = configured;
      for (const trigger of ["career_schedule_due", "career_daily_due", "career_company_follow_changed", "company_request_followup_due"]) {
        run.trigger = trigger;
        await processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
        const invocation = calls.at(-1);
        assert.equal(invocation.assistantModel, ["career_schedule_due", "career_daily_due"].includes(trigger) ? configured?.trim() || GPT_6_LUNA_MODEL : undefined);
        assert.equal(invocation.assistantOpenAIResponsesReasoningEffort, ["career_schedule_due", "career_daily_due"].includes(trigger) ? "high" : undefined);
        assert.equal(invocation.backgroundInvocation.runId, "run");
      }
    }
    run.trigger = "career_source_reconciled";
    delete process.env.CAREER_SCHEDULED_AGENT_MODEL;
    for (const sourceEvents of [[{sourceKind:"schedule"}], [{sourceKind:"talent_selection",dailySourceId:"selection"}]]) {
      run.trigger_payload.sourceEvents = sourceEvents;
      await processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
      assert.equal(calls.at(-1).assistantModel, GPT_6_LUNA_MODEL);
    }
    run.trigger_payload.sourceEvents = [{sourceKind:"agent_contact"}];
    await processCareerBackgroundRun({ admin, userId: "owner", conversationId: "conversation", runId: "run" });
    assert.equal(calls.at(-1).assistantModel, undefined);
    assert.equal(calls.length, 15);
  } finally {
    if (previous === undefined) delete process.env.CAREER_SCHEDULED_AGENT_MODEL;
    else process.env.CAREER_SCHEDULED_AGENT_MODEL = previous;
  }
});
