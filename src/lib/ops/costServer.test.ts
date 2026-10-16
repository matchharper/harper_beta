import assert from "node:assert/strict";
import test from "node:test";
import { fetchOpsCosts, parseOpsCostDateRange } from "./costServer";

const PROVIDER_ENV_NAMES = [
  "ANTHROPIC_ADMIN_API_KEY",
  "ANTHROPIC_OAUTH_TOKEN",
  "OPENAI_ADMIN_API_KEY",
  "OPENROUTER_MANAGEMENT_API_KEY",
  "EXA_SERVICE_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
] as const;

test("OpenAI billing items reconcile with daily totals across pages", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    PROVIDER_ENV_NAMES.map((name) => [name, process.env[name]])
  );
  for (const name of PROVIDER_ENV_NAMES) delete process.env[name];
  process.env.OPENAI_ADMIN_API_KEY = "test-admin-key";
  const requests: URL[] = [];
  const result = (line_item: string | null, value: number | string) => ({
    line_item,
    amount: { value, currency: "usd" },
  });
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(url.pathname, "/v1/organization/costs");
    assert.equal(url.searchParams.get("group_by[]"), "line_item");
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-admin-key"
    );
    return Response.json(
      url.searchParams.has("page")
        ? {
            data: [
              {
                start_time: Date.parse("2025-01-03T00:00:00Z") / 1000,
                results: [
                  result("model-a, input", 3),
                  result("web search", 0.5),
                  result("adjustment", -0.25),
                ],
              },
            ],
            has_more: false,
          }
        : {
            data: [
              {
                start_time: Date.parse("2025-01-02T00:00:00Z") / 1000,
                results: [
                  result("model-a, input", "1.25"),
                  result("model-a, input", 0.75),
                  result("web search", 0.5),
                  result(null, 0.125),
                  result("unused", 0),
                ],
              },
            ],
            has_more: true,
            next_page: "second-page",
          }
    );
  }) as typeof fetch;

  try {
    const response = await fetchOpsCosts(
      parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
    );
    const cost = response.costs.find((provider) => provider.id === "openai")!;
    assert.equal(cost.status, "ok");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get("page"), "second-page");
    assert.equal(cost.total, 5.875);
    assert.deepEqual(cost.points, [
      { date: "2025-01-02", amount: 2.625 },
      { date: "2025-01-03", amount: 3.25 },
    ]);
    assert.deepEqual(
      cost.breakdown?.map(({ label, total }) => ({ label, total })),
      [
        { label: "model-a, input", total: 5 },
        { label: "web search", total: 1 },
        { label: "미분류", total: 0.125 },
        { label: "adjustment", total: -0.25 },
      ]
    );
    for (const point of cost.points) {
      const itemSum: number = cost.breakdown!.reduce(
        (sum, item) =>
          sum + (item.points.find((p) => p.date === point.date)?.amount ?? 0),
        0
      );
      assert.equal(itemSum, point.amount);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of PROVIDER_ENV_NAMES) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

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
          {
            date: "2025-01-02 00:00:00",
            model: "provider/model-a",
            endpoint_id: "one",
            usage: 0.5,
          },
          {
            date: "2025-01-02 00:00:00",
            model: "provider/model-a",
            endpoint_id: "two",
            usage: "0.25",
          },
          { date: "2025-01-04 00:00:00", model: "provider/model-b", usage: 1 },
          {
            date: "2025-01-04 00:00:00",
            model_permaslug: "provider/model-a",
            usage: 0.25,
          },
          { date: "2025-01-04 00:00:00", usage: 0.25 },
          { date: "2025-01-04 00:00:00", model: "unused", usage: 0 },
          ,
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
      breakdown: [
        {
          label: "provider/model-a",
          total: 1,
          points: [
            { date: "2025-01-02", amount: 0.75 },
            { date: "2025-01-04", amount: 0.25 },
          ],
        },
        {
          label: "provider/model-b",
          total: 1,
          points: [{ date: "2025-01-04", amount: 1 }],
        },
        {
          label: "미분류",
          total: 0.25,
          points: [{ date: "2025-01-04", amount: 0.25 }],
        },
      ],
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

test("Claude billing descriptions reconcile in dollars across pages", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    PROVIDER_ENV_NAMES.map((name) => [name, process.env[name]])
  );
  for (const name of PROVIDER_ENV_NAMES) delete process.env[name];
  process.env.ANTHROPIC_ADMIN_API_KEY = "test-admin-key";
  const requests: URL[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.equal(url.pathname, "/v1/organizations/cost_report");
    assert.equal(url.searchParams.get("group_by[]"), "description");
    assert.equal(new Headers(init?.headers).get("x-api-key"), "test-admin-key");
    return Response.json(
      url.searchParams.has("page")
        ? {
            data: [
              {
                starting_at: "2025-01-03T00:00:00Z",
                results: [
                  { description: "Model A - Input Tokens", amount: "300" },
                  { description: "Adjustment", amount: "-25" },
                ],
              },
            ],
            has_more: false,
          }
        : {
            data: [
              {
                starting_at: "2025-01-02T00:00:00Z",
                results: [
                  { description: "Model A - Input Tokens", amount: "125" },
                  { description: "Model A - Input Tokens", amount: "75" },
                  { description: "Model A - Cache Hit", amount: "12.5" },
                  {
                    description: "Web Search",
                    cost_type: "web_search",
                    amount: "50",
                  },
                  {
                    model: "model-b",
                    token_type: "output_tokens",
                    cost_type: "tokens",
                    amount: "25",
                  },
                  { amount: "12.5" },
                  { description: "unused", amount: "0" },
                ],
              },
            ],
            has_more: true,
            next_page: "second-page",
          }
    );
  }) as typeof fetch;
  try {
    const response = await fetchOpsCosts(
      parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
    );
    const cost = response.costs.find((provider) => provider.id === "claude")!;
    assert.equal(cost.status, "ok");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get("page"), "second-page");
    assert.equal(cost.total, 5.75);
    assert.deepEqual(cost.points, [
      { date: "2025-01-02", amount: 3 },
      { date: "2025-01-03", amount: 2.75 },
    ]);
    assert.deepEqual(
      cost.breakdown?.map(({ label, total }) => ({ label, total })),
      [
        { label: "Model A - Input Tokens", total: 5 },
        { label: "Web Search", total: 0.5 },
        { label: "model-b · output_tokens · tokens", total: 0.25 },
        { label: "Model A - Cache Hit", total: 0.125 },
        { label: "미분류", total: 0.125 },
        { label: "Adjustment", total: -0.25 },
      ]
    );
    for (const point of cost.points) {
      assert.equal(
        cost.breakdown!.reduce(
          (sum, item) =>
            sum + (item.points.find((p) => p.date === point.date)?.amount ?? 0),
          0
        ),
        point.amount
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of PROVIDER_ENV_NAMES) {
      const value = originalEnv[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
