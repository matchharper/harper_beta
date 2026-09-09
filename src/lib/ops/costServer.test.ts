import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpsCosts, parseOpsCostDateRange } from "./costServer";

const PROVIDER_ENV_NAMES = [
  "ANTHROPIC_ADMIN_API_KEY",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_ADMIN_API_KEY",
  "OPENROUTER_MANAGEMENT_API_KEY",
  "XAI_MANAGEMENT_API_KEY",
  "XAI_TEAM_ID",
  "EXA_SERVICE_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "DEEPSEEK_API_KEY",
] as const;

test("loads OpenRouter daily usage and remaining credit with a management key", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    PROVIDER_ENV_NAMES.map((name) => [name, process.env[name]])
  );
  const requests: Array<{ authorization: string | null; url: string }> = [];

  for (const name of PROVIDER_ENV_NAMES) delete process.env[name];
  process.env.OPENROUTER_MANAGEMENT_API_KEY = "test-management-key";

  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({
      authorization: headers.get("authorization"),
      url,
    });

    if (url.endsWith("/activity")) {
      return Response.json({
        data: [
          { date: "2025-01-02 00:00:00", usage: 0.5 },
          { date: "2025-01-02 00:00:00", usage: "0.25" },
          { date: "2025-01-04 00:00:00", usage: 1.5 },
          { date: "2025-01-01 00:00:00", usage: 99 },
          { date: "invalid", usage: 99 },
        ],
      });
    }
    if (url.endsWith("/credits")) {
      return Response.json({
        data: { total_credits: 100.5, total_usage: 25.75 },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const result = await fetchOpsCosts(
      parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-05" })
    );
    const cost = result.costs.find((provider) => provider.id === "openrouter");
    const credit = result.credits.find(
      (provider) => provider.id === "openrouter"
    );

    assert.deepEqual(cost, {
      currency: "USD",
      id: "openrouter",
      label: "OpenRouter",
      message: null,
      points: [
        { amount: 0.75, date: "2025-01-02" },
        { amount: 1.5, date: "2025-01-04" },
      ],
      status: "ok",
      total: 2.25,
    });
    assert.deepEqual(credit, {
      amounts: [{ amount: 74.75, currency: "USD" }],
      id: "openrouter",
      items: [],
      label: "OpenRouter",
      message: null,
      status: "ok",
    });
    assert.deepEqual(requests.map((request) => request.url).sort(), [
      "https://openrouter.ai/api/v1/activity",
      "https://openrouter.ai/api/v1/credits",
    ]);
    assert.ok(
      requests.every(
        (request) => request.authorization === "Bearer test-management-key"
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of PROVIDER_ENV_NAMES) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
