import assert from "node:assert/strict";
import test from "node:test";
import { runToolCall } from "./toolExecution";
import { withToolTrace, type ToolTraceEvent } from "./toolTrace";
import { withCareerBackgroundToolTrace } from "../career/background/toolTrace.server";

test("tool observers isolate runs, record inputs and errors, and cannot change execution results", async () => {
  const groups: ToolTraceEvent[][] = [[], []];
  const value = { ok: false, error: "Actual tool result" };
  await Promise.all(
    groups.map((events, index) =>
      withToolTrace(
        async (event) => {
          events.push(event);
        },
        async () => {
          const captured = await runToolCall(
            async () => {
              await new Promise((resolve) => setTimeout(resolve, index));
              if (index) throw new Error("Executor failed");
              return value;
            },
            {
              name: index ? "read_matching" : "load_career_capabilities",
              callId: `call-${index}`,
              input: { index },
            }
          );
          assert.equal(captured.returned, !index);
          if (captured.returned) assert.equal(captured.value, value);
        }
      )
    )
  );
  assert.deepEqual(
    groups[0].map((event) => event.phase),
    ["started", "returned"]
  );
  assert.deepEqual(
    groups[1].map((event) => event.phase),
    ["started", "threw"]
  );
  groups.forEach((events, index) => {
    assert.deepEqual(events[0].input, { index });
    assert.ok(events.every((event) => event.callId === `call-${index}`));
    assert.equal(events[0].executionId, events[1].executionId);
    assert.equal(typeof events[1].durationMs, "number");
  });
  let executions = 0;
  const result = await withToolTrace(
    async () => {
      throw new Error("Log storage offline");
    },
    () =>
      runToolCall(
        async () => {
          executions++;
          return value;
        },
        { name: "deliver_career_email" }
      )
  );
  assert.equal(executions, 1);
  assert.ok(result.returned);
  assert.equal(result.value, value);
});

test("background tracing stores complete logs in the existing store across resumptions", async () => {
  const rows: any[] = [];
  const admin: any = {
    from: (table: string) => {
      assert.equal(table, "logs");
      return {
        insert: async (row: any) => {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };
  const longText = "完整結果 ".repeat(1000);
  for (let attempt = 0; attempt < 2; attempt++)
    await withCareerBackgroundToolTrace(
      { admin, userId: "owner", runId: "run" },
      () =>
        runToolCall(async () => ({ modelOutput: longText }), {
          name: "read_document",
          callId: "same-provider-id",
          input: { id: "document" },
        })
    );
  assert.equal(rows.length, 4);
  assert.ok(
    rows.every(
      (row) => row.user_id === "owner" && row.meta_data.runId === "run"
    )
  );
  assert.notEqual(rows[0].meta_data.executionId, rows[2].meta_data.executionId);
  assert.equal(JSON.parse(rows[1].meta_data.resultText).modelOutput, longText);
});
