import assert from "node:assert/strict";
import test from "node:test";
import { createAgentUsageLogger } from "./agentsUsageLogging";
import type { agentsRequest } from "./agentsApi";

test("usage refresh has a hard deadline even when a transport ignores cancellation", async () => {
  const logs: any[][] = [];
  const original = console.log;
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  try {
    const log = createAgentUsageLogger(
      "career/application:browser",
      "gpt-6-astra"
    );
    const started = Date.now();
    await log.collect(
      "unavailable",
      (async () => new Promise(() => {})) as typeof agentsRequest
    );
    assert.ok(Date.now() - started < 3000);
    assert.equal(logs.length, 1);
    assert.equal(logs[0][1].costStatus, "usage_unavailable");
    assert.equal(logs[0][1].estimatedCostUsd, null);
  } finally {
    console.log = original;
  }
});

test("browser usage snapshots deduplicate, follow the real model and distinguish aggregate estimates", async () => {
  const logs: any[][] = [];
  const original = console.log;
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  try {
    const log = createAgentUsageLogger(
      "career/application:browser",
      "gpt-6-luna"
    );
    const session = {
      id: "session-a",
      agent: { model: "gpt-6-astra" },
      usage: {
        input_tokens: 300000,
        input_tokens_details: { cached_tokens: 1000 },
        output_tokens: 1000,
      },
      privatePage: "private-answer",
    };
    log.session("session-a", session);
    log.session("session-a", session);
    log.turn("session-a", {
      id: "turn-a",
      usage: { input_tokens: 1000, output_tokens: 100 },
    });
    log.turn("session-a", {
      id: "turn-b",
      subagent_id: "child",
      usage: { input_tokens: 2000, output_tokens: 100 },
    });
    await log.collect("session-a", (async () => ({
      ...session,
      usage: { input_tokens: 301000, output_tokens: 1100 },
    })) as typeof agentsRequest);
    assert.equal(logs.length, 4);
    assert.equal(logs[0][1].model, "gpt-6-astra");
    assert.equal(logs[0][1].estimatedCostUsd, 3.041);
    assert.equal(
      logs[0][1].costBreakdown.inputUsdPerMtok,
      10,
      "aggregate input cannot determine per-call long-context pricing"
    );
    for (const [, receipt] of logs) {
      assert.equal(receipt.aggregation, "cumulative_snapshot_do_not_sum");
      assert.equal(receipt.costStatus, "estimated_partial");
      assert.ok(
        receipt.costLimitations.includes("cache_write_tokens_unavailable")
      );
    }
    assert.equal(logs[1][1].turnId, "turn-a");
    assert.equal(logs[2][1].turnId, "turn-b");
    assert.doesNotMatch(JSON.stringify(logs), /private-/);
    await log.collect("session-a", (async () => {
      throw new Error("offline");
    }) as typeof agentsRequest);
    assert.equal(
      logs.length,
      4,
      "refresh failure must not erase already observed usage"
    );

    const missing = createAgentUsageLogger(
      "career/application:form_inspection"
    );
    missing.session("session-b", { id: "session-b", usage: null });
    await missing.collect("session-b", (async () => {
      throw new Error("offline");
    }) as typeof agentsRequest);
    assert.equal(logs.at(-1)?.[1].estimatedCostUsd, null);
    assert.equal(logs.at(-1)?.[1].costStatus, "usage_unavailable");
  } finally {
    console.log = original;
  }
});
