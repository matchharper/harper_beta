import assert from "node:assert/strict";
import test from "node:test";
import {
  logLlmTokenUsage,
  logLlmUsageToConsole,
  estimateLlmUsageCost,
  extractLlmTokenUsage,
} from "./usageLogging";
import { withLlmUsageContext } from "./usageContext";

test("unregistered application completions log each actual model's cost without prompt or private metadata", () => {
  const logs: any[][] = [];
  const original = console.log;
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  try {
    withLlmUsageContext(
      {
        requestId: "request-a",
        conversationId: "conversation-a",
        userId: "private-user",
      },
      () => {
        logLlmTokenUsage({
          label: "career_tool:simulate_application:review",
          model: "gpt-6-luna",
          meta: { privateData: "private-resume" },
          response: {
            id: "completion-a",
            model: "gpt-5.6-terra",
            choices: [{ content: "private-answer" }],
            usage: { input_tokens: 1000, output_tokens: 100 },
          },
        });
        logLlmTokenUsage({
          label: "career:application_full_draft",
          model: "claude-sonnet-5-5",
          response: {
            usage: {
              input_tokens: 1000,
              cache_creation_input_tokens: 500,
              cache_read_input_tokens: 2000,
              output_tokens: 100,
            },
          },
        });
      }
    );
    assert.equal(logs.length, 2);
    assert.equal(logs[0][0], "[llm-usage]");
    assert.equal(logs[0][1].model, "gpt-5.6-terra");
    assert.equal(logs[0][1].configuredModel, "gpt-6-luna");
    assert.equal(logs[0][1].estimatedCostUsd, 0.0032);
    assert.equal(logs[0][1].requestId, "request-a");
    assert.equal(logs[0][1].usageScope, "request");
    assert.equal(logs[1][1].estimatedCostUsd, 0.00465);
    assert.equal(logs[1][1].totalProcessedInputTokens, 3500);
    assert.doesNotMatch(JSON.stringify(logs), /private-/);
  } finally {
    console.log = original;
  }
});

test("missing usage and unknown actual model are unknown costs, never zero or configured-model prices", () => {
  const logs: any[][] = [];
  const original = console.log;
  console.log = (...args) => logs.push(args[0] === "[llm-usage]" ? [args[0], JSON.parse(args[1])] : args);
  try {
    logLlmUsageToConsole({ model: "gpt-6-luna", response: {} });
    logLlmUsageToConsole({
      model: "gpt-6-luna",
      response: {
        model: "unknown-provider-model",
        usage: { input_tokens: 1000, output_tokens: 100 },
      },
    });
    logLlmUsageToConsole({
      model: "gpt-6-luna",
      response: { usage: { input_tokens: 0, output_tokens: 0 } },
    });
    assert.equal(logs[0][1].costStatus, "usage_unavailable");
    assert.equal(logs[0][1].estimatedCostUsd, null);
    assert.equal(logs[1][1].costStatus, "unpriced");
    assert.equal(logs[1][1].estimatedCostUsd, null);
    assert.equal(logs[2][1].costStatus, "estimated");
    assert.equal(logs[2][1].estimatedCostUsd, 0);
  } finally {
    console.log = original;
  }
});

test("Astra pricing includes caches and uses the higher rate only above 272K per call", () => {
  const cost = (tokens: number) =>
    estimateLlmUsageCost(
      "gpt-6-astra",
      extractLlmTokenUsage({
        usage: {
          input_tokens: tokens,
          input_tokens_details: {
            cached_tokens: 1000,
            cache_write_tokens: 1000,
          },
          output_tokens: 1000,
        },
      })
    );
  assert.equal(cost(272000)?.estimatedCostUsd, 2.7635);
  assert.equal(cost(272001)?.estimatedCostUsd, 5.50202);
  assert.equal(cost(272000)?.inputUsdPerMtok, 10);
  assert.equal(cost(272001)?.inputUsdPerMtok, 20);
});

test("explicit provider cost and duration are logged without serializing Decisions input", (t) => {
  const logs: any[] = [];
  t.mock.method(console, "log", (_: string, json: string) => logs.push(JSON.parse(json)));
  for (const providerCostUsd of [0, 0.00001]) {
    logLlmUsageToConsole({
      label: "org/slack-router:decision", model: "typesafe/jev-1.13",
      response: { model: "typesafe/jev-1.13-20260917", usage: { input_tokens: 500, output_tokens: 25 } },
      providerCostUsd, durationMs: 150, meta: { thread: "private-company-chat" },
    });
  }
  assert.deepEqual(logs.map((log) => log.estimatedCostUsd), [0, 0.00001]);
  assert.ok(logs.every((log) => log.costStatus === "provider_reported" && log.durationMs === 150));
  assert.doesNotMatch(JSON.stringify(logs), /private-company-chat/);
});

test("persists reported routing cost and duration, and marks missing usage as unpriced", { timeout: 1000 }, async (t) => {
  const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
  const original = envNames.map((name) => process.env[name]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  t.after(() => envNames.forEach((name, i) => {
    if (original[i] === undefined) delete process.env[name];
    else process.env[name] = original[i];
  }));
  t.mock.method(console, "log", () => {});
  let resolveWrites!: (value: any[]) => void;
  const writes = new Promise<any[]>((resolve) => { resolveWrites = resolve; });
  const captured: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(String(url), "http://127.0.0.1:54321/rest/v1/llm_logs");
    captured.push(JSON.parse(String(init.body)));
    if (captured.length === 2) resolveWrites(captured);
    return new Response(null, { status: 201 });
  });
  logLlmTokenUsage({
    label: "org/slack-router:decision", model: "typesafe/jev-1.13",
    response: { usage: { input_tokens: 500, output_tokens: 25 } },
    providerCostUsd: 0.00001, durationMs: 150,
  });
  logLlmTokenUsage({ label: "org/slack-router:decision", model: "typesafe/jev-1.13", response: {} });
  const [reported, unknown] = await writes;
  assert.equal(reported.source, "org/slack-router");
  assert.equal(reported.estimated_cost_usd, 0.00001);
  assert.equal(reported.cost_status, "provider_reported");
  assert.equal(reported.meta.durationMs, 150);
  assert.equal(reported.meta.usage.inputTokens, 500);
  assert.equal(unknown.cost_status, "unpriced");
});
