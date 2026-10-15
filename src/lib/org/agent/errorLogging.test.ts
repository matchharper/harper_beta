import assert from "node:assert/strict";
import test from "node:test";
import { recordOrgAgentFailure } from "./errorLogging";

const context = {
  userId: "actor", workspaceId: "workspace", conversationId: "conversation",
  userMessageId: 42, runId: "run", slackThreadId: "thread",
  slackReplyJobId: "job", model: "model", stage: "context",
};

test("persists database diagnostics with request correlation before emitting the failure reply", async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { calls.push(args); });
  let saved: any;
  const admin = { from(table: string) {
    assert.equal(table, "logs");
    return { async insert(row: unknown) {
      assert.equal(calls[0][0], "[org/agent:turn-error]");
      saved = row;
      return { error: null };
    } };
  } } as any;
  await recordOrgAgentFailure({ ...context, admin,
    error: { message: "query failed", code: "42703", details: "column absent", hint: "refresh schema" },
  });
  assert.equal(saved.type, "org_agent_error");
  assert.equal(saved.user_id, "actor");
  assert.equal(saved.meta_data.slackReplyJobId, "job");
  assert.equal(saved.meta_data.stage, "context");
  assert.deepEqual(JSON.parse(saved.meta_data.error), {
    code: "42703", message: "query failed", details: "column absent", hint: "refresh schema",
  });
});

test("retains masked stack and nested cause even when DB logging fails", async (t) => {
  const calls: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { calls.push(args); });
  const failure = new Error("request failed: Bearer sample-secret", {
    cause: { code: "ETIMEDOUT", message: "upstream timed out" },
  });
  for (const throws of [false, true]) {
    const admin = { from() { return { async insert() {
      const error = { code: "08006", message: "DB disconnected" };
      if (throws) throw error;
      return { error };
    } }; } } as any;
    await assert.doesNotReject(recordOrgAgentFailure({ ...context, admin, error: failure }));
  }
  const output = JSON.stringify(calls);
  assert.match(output, /ETIMEDOUT/);
  assert.match(output, /errorLogging.test.ts/);
  assert.match(output, /turn-error-log-failed/);
  assert.match(output, /08006/);
  assert.doesNotMatch(output, /sample-secret/);
});
