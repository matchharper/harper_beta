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
  "BROWSER_USE_API_KEY",
  "BROWSERLESS_API_TOKEN",
  "VERCEL_API_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_ORG_ID",
] as const;

async function withProviders(
  env: Record<string, string>,
  fetcher: typeof fetch,
  check: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  const originalEnv = Object.fromEntries(
    PROVIDER_ENV_NAMES.map((name) => [name, process.env[name]])
  );
  for (const name of PROVIDER_ENV_NAMES) delete process.env[name];
  Object.assign(process.env, env);
  globalThis.fetch = fetcher;
  try {
    await check();
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of PROVIDER_ENV_NAMES) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
}

test("Browser Use paginates V4 run costs, filters dates, and reads credit independently", async () => {
  const run = (id: string, date: string, cost: string) => ({
    id,
    createdAt: `${date}T12:00:00Z`,
    totalCostUsd: cost,
    model: "model-a",
  });
  const requests: URL[] = [];
  await withProviders(
    { BROWSER_USE_API_KEY: "bu-key" },
    async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      assert.equal(
        new Headers(init?.headers).get("X-Browser-Use-API-Key"),
        "bu-key"
      );
      if (url.pathname === "/api/v2/billing/account")
        return Response.json({ totalCreditsBalanceUsd: "32.75" });
      assert.equal(url.pathname, "/api/v4/runs");
      return Response.json(
        url.searchParams.has("cursor")
          ? {
              runs: [
                run("second", "2025-01-02", "1.5"),
                run("old", "2025-01-01", "99"),
              ],
              hasMore: false,
            }
          : {
              runs: [
                run("outside", "2025-01-04", "99"),
                run("first", "2025-01-03", "0.25"),
                run("second", "2025-01-02", "1.5"),
              ],
              hasMore: true,
              nextCursor: "next",
            }
      );
    },
    async () => {
      const result = await fetchOpsCosts(
        parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
      );
      const cost = result.costs.find((item) => item.id === "browser-use")!;
      assert.equal(cost.total, 1.75);
      assert.equal(cost.status, "ok");
      assert.deepEqual(cost.points, [
        { date: "2025-01-02", amount: 1.5 },
        { date: "2025-01-03", amount: 0.25 },
      ]);
      assert.equal(cost.breakdown?.[0].total, cost.total);
      assert.match(cost.message!, /브라우저·프록시 비용/);
      assert.equal(
        requests.filter((url) => url.searchParams.get("cursor") === "next")
          .length,
        1
      );
      assert.deepEqual(
        result.credits.find((item) => item.id === "browser-use")?.amounts,
        [{ amount: 32.75, currency: "USD" }]
      );
    }
  );
});

test("Browserless keeps billing-cycle units separate from selected-period USD costs", async () => {
  await withProviders(
    { BROWSERLESS_API_TOKEN: "bl-secret" },
    async (input) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin + url.pathname,
        "https://api.browserless.io/v1/account/usage"
      );
      assert.equal(url.searchParams.get("token"), "bl-secret");
      return Response.json({
        plan: { name: "free" },
        units: { included: 1000, used: 518, remaining: 480 },
        billingPeriod: {
          start: "2025-01-01T00:00:00Z",
          end: "2025-02-01T00:00:00Z",
        },
      });
    },
    async () => {
      const result = await fetchOpsCosts(
        parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
      );
      const cost = result.costs.find((item) => item.id === "browserless")!;
      assert.equal(cost.status, "ok");
      assert.equal(cost.total, null);
      assert.deepEqual(cost.points, []);
      assert.deepEqual(cost.usage, {
        from: "2025-01-01",
        through: "2025-02-01",
        plan: "free",
        included: 1000,
        used: 518,
        remaining: 480,
      });
      const supabase = result.costs.find((item) => item.id === "supabase")!;
      assert.equal(supabase.status, "unavailable");
      assert.equal(supabase.total, null);
    }
  );
});

test("Vercel JSONL reconciles billed service charges including credits, not effective cost", async () => {
  await withProviders(
    { VERCEL_TOKEN: "vercel-secret", VERCEL_ORG_ID: "team-test" },
    async (input, init) => {
      const url = new URL(String(input));
      assert.equal(
        url.origin + url.pathname,
        "https://api.vercel.com/v1/billing/charges"
      );
      assert.equal(url.searchParams.get("teamId"), "team-test");
      assert.equal(url.searchParams.get("from"), "2025-01-02T00:00:00.000Z");
      assert.equal(url.searchParams.get("to"), "2025-01-05T00:00:00.000Z");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer vercel-secret"
      );
      const charge = (
        date: string,
        cost: number | string,
        category: string
      ) => ({
        ChargePeriodStart: `${date}T08:00:00Z`,
        BillingCurrency: "USD",
        BilledCost: cost,
        EffectiveCost: 99,
        ServiceName: "Functions",
        ChargeCategory: category,
      });
      return new Response(
        [
          charge("2025-01-02", "3.5", "Usage"),
          charge("2025-01-02", -1, "Credit"),
          charge("2025-01-03", 1.25, "Usage"),
          charge("2025-01-04", 99, "Usage"),
        ]
          .map((item) => JSON.stringify(item))
          .join("\r\n") + "\n",
        { headers: { "Content-Type": "application/jsonl" } }
      );
    },
    async () => {
      const result = await fetchOpsCosts(
        parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
      );
      const cost = result.costs.find((item) => item.id === "vercel")!;
      assert.equal(cost.status, "ok");
      assert.equal(cost.total, 3.75);
      assert.deepEqual(cost.points, [
        { date: "2025-01-02", amount: 2.5 },
        { date: "2025-01-03", amount: 1.25 },
      ]);
      assert.deepEqual(
        cost.breakdown?.map(({ label, total }) => ({ label, total })),
        [
          { label: "Functions · Usage", total: 4.75 },
          { label: "Functions · Credit", total: -1 },
        ]
      );
    }
  );
});

test("provider errors never become zero cost or leak Browserless credentials", async () => {
  await withProviders(
    {
      BROWSERLESS_API_TOKEN: "secret-must-not-leak",
      BROWSER_USE_API_KEY: "bu-key",
      VERCEL_API_TOKEN: "vc-key",
      VERCEL_TEAM_ID: "team",
    },
    async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.browserless.io")
        return Response.json({ message: String(input) }, { status: 401 });
      if (url.pathname === "/api/v2/billing/account")
        return Response.json({ totalCreditsBalanceUsd: 5 });
      if (url.pathname === "/api/v4/runs")
        return Response.json({
          runs: [],
          hasMore: true,
          nextCursor: "same-cursor",
        });
      return new Response('{"BilledCost": invalid}\n');
    },
    async () => {
      const result = await fetchOpsCosts(
        parseOpsCostDateRange({ from: "2025-01-02", through: "2025-01-03" })
      );
      for (const id of ["browserless", "browser-use", "vercel"]) {
        const cost = result.costs.find((item) => item.id === id)!;
        assert.equal(cost.status, "error");
        assert.equal(cost.total, null);
        assert.deepEqual(cost.points, []);
      }
      assert.equal(
        result.credits.find((item) => item.id === "browser-use")?.status,
        "ok"
      );
      assert.equal(
        JSON.stringify(result).includes("secret-must-not-leak"),
        false
      );
    }
  );
});

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
