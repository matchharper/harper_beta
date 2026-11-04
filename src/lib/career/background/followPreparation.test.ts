import test from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";

test("background execution waits for preparation, receives its context and rechecks cancellation before the original agent", async (t) => {
  const modules = Module as any,
    original = modules._load;
  class SourceChanged extends Error {}
  let run: any,
    ready = false,
    sourceReads = 0,
    cancelAt = 0,
    contextReads = 0,
    finished = 0,
    historyReads = 0;
  const turns: any[] = [],
    cancelled: any[] = [];
  const reset = () => {
    run = {
      id: "run",
      talent_id: "owner",
      conversation_id: "conversation",
      status: "handed_off",
      created_at: "2026-11-02",
      trigger_payload: {
        runContract: "career_agent_v1",
        agentInvocation: { replyId: "reply" },
        sourceEvents: [
          { sourceKind: "schedule", scheduleKey: "career_check_in" },
        ],
      },
    };
    ready = false;
    sourceReads = 0;
    cancelAt = 0;
    contextReads = 0;
    finished = 0;
    historyReads = 0;
    turns.length = 0;
    cancelled.length = 0;
  };
  const should = (r: any) =>
    r.trigger_payload.sourceEvents[0]?.scheduleKey === "career_check_in";
  t.mock.method(
    modules,
    "_load",
    function (this: unknown, name: string, ...args: any[]) {
      if (name === "./inbox")
        return {
          prepareCareerInboxContext: async () => ({
            text: "Inbox factual context",
            meetingScheduleVersions: [],
          }),
        };
      if (name === "@/lib/email/runtime/store")
        return { ensureEmailConversation: async () => "conversation" };
      if (name === "../chatTurn")
        return {
          runCareerChatTurn: async (args: any) => {
            turns.push(args);
            run.status = "completed";
          },
        };
      if (name === "../agentReplyQueue")
        return {
          enqueueCareerAgentReply: async () => {
            throw Error("Unexpected new reply");
          },
        };
      if (name === "../agentContinuation")
        return {
          dispatchCareerCheckpoint: async () => {},
          resumeCareerAgentAfterWork: async () => {},
        };
      if (name === "../agentTurnRuntime.server")
        return { CareerAgentReplyUnavailable: class extends Error {} };
      if (name === "../capabilities/runtime")
        return { CareerReplyContinuation: class extends Error {} };
      if (name === "../schedules/server")
        return {
          CareerSourceChangedError: SourceChanged,
          assertCareerSourceEventsCurrent: async () => {
            sourceReads++;
            if (sourceReads === cancelAt)
              throw new SourceChanged("User paused schedule");
          },
          finishCareerSourceEvents: async () => {
            finished++;
          },
        };
      if (name === "./prompt")
        return {
          renderCareerBackgroundInvocation: () => "Original invocation",
        };
      if (name === "../companies/preparation")
        return {
          shouldPrepareFollowedCompanies: should,
          prepareFollowedCompanies: async () => ({
            ready: !should(run) || ready,
            state: { status: "ready" },
          }),
          readPreparedFollowContext: async () => {
            contextReads++;
            return "Followed company facts and saved role assessment";
          },
        };
      if (name === "./toolTrace.server")
        return {
          withCareerBackgroundToolTrace: (_args: unknown, fn: () => unknown) =>
            fn(),
        };
      return original.call(this, name, ...args);
    }
  );
  const admin: any = {
    from(table: string) {
      if (table === "career_email_messages") historyReads++;
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        single: async () => ({ data: structuredClone(run), error: null }),
        then: (resolve: any, reject: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve, reject),
      };
      assert.ok(
        ["opportunity_discovery_run", "career_email_messages"].includes(table),
        table
      );
      return q;
    },
    rpc: async (name: string, args: any) => {
      assert.equal(name, "cancel_career_background_run");
      cancelled.push(args);
      run.status = "cancelled";
      return { error: null };
    },
  };
  const { processCareerBackgroundRun } = await import("./server");
  const execute = () =>
    processCareerBackgroundRun({
      admin,
      userId: "owner",
      conversationId: "conversation",
      runId: "run",
    });
  reset();
  await execute();
  assert.equal(turns.length, 0);
  assert.equal(historyReads, 0);
  assert.equal(run.status, "handed_off");
  ready = true;
  await execute();
  assert.equal(turns.length, 1);
  assert.match(turns[0].proactiveContext, /Followed company facts/);
  assert.equal(finished, 1);
  assert.equal(turns[0].agentReplyId, "reply");
  assert.ok(turns[0].deadlineAt <= Date.now() + 430000);
  reset();
  ready = true;
  cancelAt = 2;
  await execute();
  assert.equal(turns.length, 0);
  assert.equal(cancelled.length, 1);
  assert.equal(run.status, "cancelled");
  reset();
  run.trigger_payload.sourceEvents = [{ sourceKind: "schedule" }];
  await execute();
  assert.equal(turns.length, 1);
  assert.equal(contextReads, 0);
  assert.doesNotMatch(turns[0].proactiveContext, /Followed company facts/);
});
