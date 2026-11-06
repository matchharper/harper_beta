import {
  BillingClient,
  GetCreditsCommand,
  type CreditData,
} from "@aws-sdk/client-billing";
import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";
import type {
  OpsCostProviderId,
  OpsCostProviderResult,
  OpsCostResponse,
  OpsCreditAmount,
  OpsCreditItem,
  OpsCreditProviderId,
  OpsCreditProviderResult,
  OpsDailyCostPoint,
} from "@/lib/ops/costTypes";

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 31;
const REQUEST_TIMEOUT_MS = 20_000;
const EXA_REQUEST_CONCURRENCY = 6;

type DateRange = {
  endExclusive: string;
  from: string;
  through: string;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Missing monetary/usage fields must not become a successful zero-cost result.
function requiredNumber(value: unknown, field: string) {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim()) ||
    !Number.isFinite(Number(value))
  ) {
    throw new Error(`${field} 값을 조회하지 못했습니다.`);
  }
  return Number(value);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || toDateOnly(date) !== value
    ? null
    : value;
}

function addUtcDays(dateOnly: string, days: number) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateOnly(date);
}

function enumerateDates(from: string, endExclusive: string) {
  const dates: string[] = [];
  for (let date = from; date < endExclusive; date = addUtcDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

export function parseOpsCostDateRange(args: {
  from?: string | null;
  through?: string | null;
}): DateRange {
  const today = toDateOnly(new Date());
  let through = parseDateOnly(args.through) ?? today;
  if (through > today) through = today;

  let from =
    parseDateOnly(args.from) ?? addUtcDays(through, -(DEFAULT_RANGE_DAYS - 1));
  if (from > through) [from, through] = [through, from];

  const earliest = addUtcDays(through, -(MAX_RANGE_DAYS - 1));
  if (from < earliest) from = earliest;

  return {
    endExclusive: addUtcDays(through, 1),
    from,
    through,
  };
}

function getRemoteErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const nestedError = asRecord(record.error);
  const candidate =
    asString(nestedError.message) ||
    asString(record.error) ||
    asString(record.message);
  return candidate.replace(/\s+/g, " ").trim().slice(0, 180);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  providerLabel: string,
  format: "json" | "jsonl" = "json"
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      // Browserless authenticates in the URL: never echo remote errors containing it.
      const detail =
        providerLabel === "Browserless" ? "" : getRemoteErrorMessage(payload);
      throw new Error(
        `${providerLabel} API ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }
    if (format === "jsonl") {
      return (await response.text())
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as unknown);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${providerLabel} API 응답 시간이 초과되었습니다.`);
    }
    if (providerLabel === "Browserless") {
      throw new Error("Browserless 사용량 조회에 실패했습니다.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function sumPoints(points: OpsDailyCostPoint[]) {
  return points.reduce((sum, point) => sum + point.amount, 0);
}

function pointsFromMap(amounts: Map<string, number>) {
  return Array.from(amounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, amount]) => ({ amount, date }));
}

function addBreakdownAmount(
  items: Map<string, Map<string, number>>,
  label: string,
  date: string,
  amount: number
) {
  const dailyAmounts = items.get(label) ?? new Map<string, number>();
  dailyAmounts.set(date, (dailyAmounts.get(date) ?? 0) + amount);
  items.set(label, dailyAmounts);
}

function breakdownFromMap(items: Map<string, Map<string, number>>) {
  return Array.from(items, ([label, dailyAmounts]) => {
    const points = pointsFromMap(dailyAmounts);
    return { label, points, total: sumPoints(points) };
  })
    .filter((item) => item.points.some((point) => point.amount !== 0))
    .sort(
      (left, right) =>
        right.total - left.total || left.label.localeCompare(right.label)
    );
}

function notConfiguredCost(
  id: OpsCostProviderId,
  label: string,
  envNames: string[]
): OpsCostProviderResult {
  return {
    currency: "USD",
    id,
    label,
    message: `${envNames.join(", ")} 설정이 필요합니다.`,
    points: [],
    status: "not_configured",
    total: null,
  };
}

function failedCost(
  id: OpsCostProviderId,
  label: string,
  error: unknown
): OpsCostProviderResult {
  return {
    currency: "USD",
    id,
    label,
    message: error instanceof Error ? error.message : "조회에 실패했습니다.",
    points: [],
    status: "error",
    total: null,
  };
}

function successfulCost(
  id: OpsCostProviderId,
  label: string,
  points: OpsDailyCostPoint[]
): OpsCostProviderResult {
  return {
    currency: "USD",
    id,
    label,
    message: null,
    points,
    status: "ok",
    total: sumPoints(points),
  };
}

function notConfiguredCredit(
  id: OpsCreditProviderId,
  label: string,
  envNames: string[]
): OpsCreditProviderResult {
  return {
    amounts: [],
    id,
    items: [],
    label,
    message: `${envNames.join(", ")} 설정이 필요합니다.`,
    status: "not_configured",
  };
}

function failedCredit(
  id: OpsCreditProviderId,
  label: string,
  error: unknown
): OpsCreditProviderResult {
  return {
    amounts: [],
    id,
    items: [],
    label,
    message: error instanceof Error ? error.message : "조회에 실패했습니다.",
    status: "error",
  };
}

async function fetchClaudeCosts(range: DateRange) {
  const label = "Claude";
  const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY?.trim();
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN?.trim();
  if (!adminKey && !oauthToken) {
    return notConfiguredCost("claude", label, [
      "ANTHROPIC_ADMIN_API_KEY 또는 ANTHROPIC_OAUTH_TOKEN",
    ]);
  }

  try {
    const amounts = new Map<string, number>();
    const lineItems = new Map<string, Map<string, number>>();
    let page = "";

    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      const query = new URLSearchParams({
        bucket_width: "1d",
        "group_by[]": "description",
        ending_at: `${range.endExclusive}T00:00:00.000Z`,
        limit: "31",
        starting_at: `${range.from}T00:00:00.000Z`,
      });
      if (page) query.set("page", page);

      const payload = asRecord(
        await fetchJson(
          `https://api.anthropic.com/v1/organizations/cost_report?${query}`,
          {
            headers: {
              ...(oauthToken
                ? { Authorization: `Bearer ${oauthToken}` }
                : { "x-api-key": adminKey! }),
              "anthropic-version": "2023-06-01",
            },
          },
          label
        )
      );

      for (const rawBucket of asArray(payload.data)) {
        const bucket = asRecord(rawBucket);
        const date = asString(bucket.starting_at).slice(0, 10);
        if (!date) continue;
        let amount = 0;
        for (const rawResult of asArray(bucket.results)) {
          const result = asRecord(rawResult);
          // Anthropic reports USD amounts in cents, including fractional cents.
          const value = asNumber(result.amount) / 100;
          const lineItem =
            asString(result.description).trim() ||
            [result.model, result.token_type, result.cost_type]
              .map((value) => asString(value).trim())
              .filter(Boolean)
              .join(" · ") ||
            "미분류";
          addBreakdownAmount(lineItems, lineItem, date, value);
          amount += value;
        }
        amounts.set(date, (amounts.get(date) ?? 0) + amount);
      }

      page = asString(payload.next_page);
      if (!payload.has_more || !page) break;
    }

    return {
      ...successfulCost("claude", label, pointsFromMap(amounts)),
      breakdown: breakdownFromMap(lineItems),
    };
  } catch (error) {
    return failedCost("claude", label, error);
  }
}

async function fetchOpenAiCosts(range: DateRange) {
  const label = "OpenAI";
  const adminKey = process.env.OPENAI_ADMIN_API_KEY?.trim();
  if (!adminKey) {
    return notConfiguredCost("openai", label, ["OPENAI_ADMIN_API_KEY"]);
  }

  try {
    const amounts = new Map<string, number>();
    const lineItems = new Map<string, Map<string, number>>();
    let page = "";

    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      const query = new URLSearchParams({
        bucket_width: "1d",
        "group_by[]": "line_item",
        end_time: String(
          Math.floor(
            new Date(`${range.endExclusive}T00:00:00.000Z`).getTime() / 1000
          )
        ),
        limit: "31",
        start_time: String(
          Math.floor(new Date(`${range.from}T00:00:00.000Z`).getTime() / 1000)
        ),
      });
      if (page) query.set("page", page);

      const payload = asRecord(
        await fetchJson(
          `https://api.openai.com/v1/organization/costs?${query}`,
          {
            headers: {
              Authorization: `Bearer ${adminKey}`,
              "Content-Type": "application/json",
            },
          },
          label
        )
      );

      for (const rawBucket of asArray(payload.data)) {
        const bucket = asRecord(rawBucket);
        const startTime = asNumber(bucket.start_time);
        if (!startTime) continue;
        const date = toDateOnly(new Date(startTime * 1000));
        let amount = 0;
        for (const rawResult of asArray(bucket.results)) {
          const result = asRecord(rawResult);
          const value = asNumber(asRecord(result.amount).value);
          const lineItem = asString(result.line_item).trim() || "미분류";
          addBreakdownAmount(lineItems, lineItem, date, value);
          amount += value;
        }
        amounts.set(date, (amounts.get(date) ?? 0) + amount);
      }

      page = asString(payload.next_page);
      if (!payload.has_more || !page) break;
    }

    return {
      ...successfulCost("openai", label, pointsFromMap(amounts)),
      breakdown: breakdownFromMap(lineItems),
    };
  } catch (error) {
    return failedCost("openai", label, error);
  }
}

async function fetchOpenRouterCosts(range: DateRange) {
  const label = "OpenRouter";
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return notConfiguredCost("openrouter", label, [
      "OPENROUTER_MANAGEMENT_API_KEY",
    ]);
  }

  try {
    const payload = asRecord(
      await fetchJson(
        "https://openrouter.ai/api/v1/activity",
        {
          headers: {
            Authorization: `Bearer ${managementKey}`,
          },
        },
        label
      )
    );
    const amounts = new Map<string, number>();
    const models = new Map<string, Map<string, number>>();

    for (const rawActivity of asArray(payload.data)) {
      const activity = asRecord(rawActivity);
      const date = parseDateOnly(asString(activity.date).slice(0, 10));
      if (!date || date < range.from || date >= range.endExclusive) continue;
      const amount = asNumber(activity.usage);
      const model =
        asString(activity.model).trim() ||
        asString(activity.model_permaslug).trim() ||
        "미분류";
      addBreakdownAmount(models, model, date, amount);
      amounts.set(date, (amounts.get(date) ?? 0) + amount);
    }

    return {
      ...successfulCost("openrouter", label, pointsFromMap(amounts)),
      breakdown: breakdownFromMap(models),
    };
  } catch (error) {
    return failedCost("openrouter", label, error);
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(values.length, 1)) },
      () => worker()
    )
  );
  return results;
}

async function fetchExaCosts(range: DateRange) {
  const label = "Exa";
  const serviceKey = process.env.EXA_SERVICE_API_KEY?.trim();
  if (!serviceKey) {
    return notConfiguredCost("exa", label, ["EXA_SERVICE_API_KEY"]);
  }

  try {
    const headers = { "x-api-key": serviceKey };
    const keyPayload = asRecord(
      await fetchJson(
        "https://admin-api.exa.ai/team-management/api-keys",
        { headers },
        label
      )
    );
    const apiKeys = asArray(keyPayload.apiKeys)
      .map((value) => asString(asRecord(value).id))
      .filter(Boolean);
    if (apiKeys.length === 0) {
      throw new Error("Exa 팀에서 조회할 API key를 찾지 못했습니다.");
    }

    const requests = enumerateDates(range.from, range.endExclusive).flatMap(
      (date) =>
        apiKeys.map((apiKeyId) => ({
          apiKeyId,
          date,
        }))
    );
    const dailyAmounts = await mapWithConcurrency(
      requests,
      EXA_REQUEST_CONCURRENCY,
      async ({ apiKeyId, date }) => {
        const query = new URLSearchParams({
          end_date: `${date}T23:59:59.999Z`,
          start_date: `${date}T00:00:00.000Z`,
        });
        const payload = asRecord(
          await fetchJson(
            `https://admin-api.exa.ai/team-management/api-keys/${encodeURIComponent(
              apiKeyId
            )}/usage?${query}`,
            { headers },
            label
          )
        );
        return { amount: asNumber(payload.total_cost_usd), date };
      }
    );

    const amounts = new Map<string, number>();
    for (const point of dailyAmounts) {
      amounts.set(point.date, (amounts.get(point.date) ?? 0) + point.amount);
    }
    return successfulCost("exa", label, pointsFromMap(amounts));
  } catch (error) {
    return failedCost("exa", label, error);
  }
}

async function fetchBrowserUseCosts(range: DateRange) {
  const label = "Browser Use";
  const key = process.env.BROWSER_USE_API_KEY?.trim();
  if (!key)
    return notConfiguredCost("browser-use", label, ["BROWSER_USE_API_KEY"]);

  try {
    const amounts = new Map<string, number>();
    const models = new Map<string, Map<string, number>>();
    const cursors = new Set<string>();
    const runIds = new Set<string>();
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    let cursor = "";
    do {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const payload = asRecord(
        await fetchJson(
          `https://api.browser-use.com/api/v4/runs?${query}`,
          { headers: { "X-Browser-Use-API-Key": key } },
          label
        )
      );
      if (!Array.isArray(payload.runs))
        throw new Error("Browser Use 실행 내역을 조회하지 못했습니다.");
      for (const rawRun of payload.runs) {
        const run = asRecord(rawRun);
        const date = parseDateOnly(asString(run.createdAt).slice(0, 10));
        const id = asString(run.id);
        if (!date || !id)
          throw new Error("Browser Use 실행 일자·ID를 조회하지 못했습니다.");
        if (date < range.from || date >= range.endExclusive || runIds.has(id))
          continue;
        runIds.add(id);
        const amount = requiredNumber(run.totalCostUsd, "Browser Use 비용");
        amounts.set(date, (amounts.get(date) ?? 0) + amount);
        addBreakdownAmount(
          models,
          asString(run.model) || "미분류",
          date,
          amount
        );
      }
      if (!payload.hasMore) break;
      // Keep pagination within the internal route's 60-second execution budget.
      if (Date.now() >= deadline) {
        throw new Error("Browser Use 전체 내역 조회 시간이 초과되었습니다.");
      }
      cursor = asString(payload.nextCursor);
      if (!cursor || cursors.has(cursor))
        throw new Error("Browser Use 다음 페이지를 조회하지 못했습니다.");
      cursors.add(cursor);
    } while (cursor);

    return {
      ...successfulCost("browser-use", label, pointsFromMap(amounts)),
      breakdown: breakdownFromMap(models),
      totalLabel: "V4 모델·검색 비용",
      message: "실행 시작일 기준 · 브라우저·프록시 비용과 크레딧·프로모션 제외",
      dashboardUrl: "https://cloud.browser-use.com/settings?tab=billing",
    };
  } catch (error) {
    return failedCost("browser-use", label, error);
  }
}

async function fetchBrowserUseCredit(): Promise<OpsCreditProviderResult> {
  const label = "Browser Use";
  const key = process.env.BROWSER_USE_API_KEY?.trim();
  if (!key)
    return notConfiguredCredit("browser-use", label, ["BROWSER_USE_API_KEY"]);
  try {
    const payload = asRecord(
      await fetchJson(
        "https://api.browser-use.com/api/v2/billing/account",
        { headers: { "X-Browser-Use-API-Key": key } },
        label
      )
    );
    return {
      id: "browser-use",
      label,
      amounts: [
        {
          amount: requiredNumber(
            payload.totalCreditsBalanceUsd,
            "Browser Use 크레딧"
          ),
          currency: "USD",
        },
      ],
      items: [],
      message: null,
      status: "ok",
    };
  } catch (error) {
    return failedCredit("browser-use", label, error);
  }
}

async function fetchBrowserlessUsage(): Promise<OpsCostProviderResult> {
  const label = "Browserless";
  const token = process.env.BROWSERLESS_API_TOKEN?.trim();
  if (!token)
    return notConfiguredCost("browserless", label, ["BROWSERLESS_API_TOKEN"]);
  try {
    const query = new URLSearchParams({ token });
    const payload = asRecord(
      await fetchJson(
        `https://api.browserless.io/v1/account/usage?${query}`,
        {},
        label
      )
    );
    const units = asRecord(payload.units);
    const period = asRecord(payload.billingPeriod);
    const from = parseDateOnly(asString(period.start).slice(0, 10));
    const through = parseDateOnly(asString(period.end).slice(0, 10));
    if (!from || !through)
      throw new Error("Browserless 결제 주기를 조회하지 못했습니다.");
    return {
      currency: "USD",
      id: "browserless",
      label,
      status: "ok",
      points: [],
      total: null,
      message: "금액 미제공 · 현재 결제 주기 사용량",
      dashboardUrl: "https://www.browserless.io/account",
      usage: {
        from,
        through,
        plan: asString(asRecord(payload.plan).name),
        used: requiredNumber(units.used, "Browserless 사용 유닛"),
        included: requiredNumber(units.included, "Browserless 포함 유닛"),
        remaining: requiredNumber(units.remaining, "Browserless 잔여 유닛"),
      },
    };
  } catch (error) {
    return failedCost("browserless", label, error);
  }
}

async function fetchVercelCosts(range: DateRange) {
  const label = "Vercel";
  const token =
    process.env.VERCEL_API_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim();
  const teamId =
    process.env.VERCEL_TEAM_ID?.trim() || process.env.VERCEL_ORG_ID?.trim();
  if (!token || !teamId) {
    return notConfiguredCost("vercel", label, [
      ...(!token ? ["VERCEL_API_TOKEN 또는 VERCEL_TOKEN"] : []),
      ...(!teamId ? ["VERCEL_TEAM_ID 또는 VERCEL_ORG_ID"] : []),
    ]);
  }
  try {
    const query = new URLSearchParams({
      from: `${range.from}T00:00:00.000Z`,
      // Vercel rounds query dates to its billing-day boundary (observed at
      // 08:00 UTC). Include the following bucket, then filter by the returned
      // ChargePeriodStart UTC date so the range's final day is not lost.
      to: `${addUtcDays(range.endExclusive, 1)}T00:00:00.000Z`,
      teamId,
    });
    const charges = asArray(
      await fetchJson(
        `https://api.vercel.com/v1/billing/charges?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Accept-Encoding": "gzip",
          },
        },
        label,
        "jsonl"
      )
    );
    const amounts = new Map<string, number>();
    const services = new Map<string, Map<string, number>>();
    for (const rawCharge of charges) {
      const charge = asRecord(rawCharge);
      const date = parseDateOnly(
        asString(charge.ChargePeriodStart).slice(0, 10)
      );
      if (!date || charge.BillingCurrency !== "USD") {
        throw new Error("Vercel 청구 일자·통화를 확인하지 못했습니다.");
      }
      if (date < range.from || date >= range.endExclusive) continue;
      const amount = requiredNumber(charge.BilledCost, "Vercel 청구 비용");
      const service =
        [charge.ServiceName, charge.ChargeCategory]
          .map(asString)
          .filter(Boolean)
          .join(" · ") || "미분류";
      amounts.set(date, (amounts.get(date) ?? 0) + amount);
      addBreakdownAmount(services, service, date, amount);
    }
    return {
      ...successfulCost("vercel", label, pointsFromMap(amounts)),
      breakdown: breakdownFromMap(services),
      totalLabel: "팀 전체 청구 비용",
      message: "제공사 청구일·BilledCost 기준 · 크레딧·조정 포함",
      dashboardUrl: "https://vercel.com/dashboard",
    };
  } catch (error) {
    return failedCost("vercel", label, error);
  }
}

function supabaseCost(): OpsCostProviderResult {
  // The public Management API exposes project add-ons, but no billing ledger.
  return {
    currency: "USD",
    id: "supabase",
    label: "Supabase",
    status: "unavailable",
    total: null,
    points: [],
    message: "공개 API에서 청구 금액 미제공",
    dashboardUrl: "https://supabase.com/dashboard/org/_/billing",
  };
}

function getAwsConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  return {
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey, sessionToken }
        : undefined,
    region: process.env.AWS_REGION?.trim() || "us-east-1",
  };
}

function hasAwsCredentials() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
    process.env.AWS_SECRET_ACCESS_KEY?.trim()
  );
}

async function fetchEc2Costs(range: DateRange) {
  const label = "AWS EC2";
  if (!hasAwsCredentials()) {
    return notConfiguredCost("ec2", label, [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ]);
  }

  try {
    const client = new CostExplorerClient(getAwsConfig());
    const amounts = new Map<string, number>();
    const netAmounts = new Map<string, number>();
    let nextPageToken: string | undefined;

    try {
      do {
        const response = await client.send(
          new GetCostAndUsageCommand({
            Filter: {
              Dimensions: {
                Key: "SERVICE",
                Values: [
                  "Amazon Elastic Compute Cloud - Compute",
                  "EC2 - Other",
                ],
              },
            },
            Granularity: "DAILY",
            GroupBy: [{ Key: "RECORD_TYPE", Type: "DIMENSION" }],
            Metrics: ["UnblendedCost"],
            NextPageToken: nextPageToken,
            TimePeriod: {
              End: range.endExclusive,
              Start: range.from,
            },
          })
        );

        for (const result of response.ResultsByTime ?? []) {
          const date = result.TimePeriod?.Start;
          if (!date) continue;
          for (const group of result.Groups ?? []) {
            const amount = asNumber(group.Metrics?.UnblendedCost?.Amount);
            const recordType = group.Keys?.[0] ?? "";
            netAmounts.set(date, (netAmounts.get(date) ?? 0) + amount);
            if (recordType !== "Credit") {
              amounts.set(date, (amounts.get(date) ?? 0) + amount);
            }
          }
        }
        nextPageToken = response.NextPageToken;
      } while (nextPageToken);
    } finally {
      client.destroy();
    }

    const points = pointsFromMap(amounts);
    const netPoints = pointsFromMap(netAmounts);
    return {
      ...successfulCost("ec2", label, points),
      netPoints,
      netTotal: sumPoints(netPoints),
    };
  } catch (error) {
    return failedCost("ec2", label, error);
  }
}

async function fetchOpenRouterCredit(): Promise<OpsCreditProviderResult> {
  const label = "OpenRouter";
  const managementKey = process.env.OPENROUTER_MANAGEMENT_API_KEY?.trim();
  if (!managementKey) {
    return notConfiguredCredit("openrouter", label, [
      "OPENROUTER_MANAGEMENT_API_KEY",
    ]);
  }

  try {
    const payload = asRecord(
      await fetchJson(
        "https://openrouter.ai/api/v1/credits",
        {
          headers: {
            Authorization: `Bearer ${managementKey}`,
          },
        },
        label
      )
    );
    const data = asRecord(payload.data);
    const remainingCredit = Math.max(
      0,
      asNumber(data.total_credits) - asNumber(data.total_usage)
    );

    return {
      amounts: [{ amount: remainingCredit, currency: "USD" }],
      id: "openrouter",
      items: [],
      label,
      message: null,
      status: "ok",
    };
  } catch (error) {
    return failedCredit("openrouter", label, error);
  }
}

function isActiveAwsCredit(credit: CreditData, now: Date) {
  if (credit.creditStatus === "DISABLED") return false;
  if (credit.endDate && credit.endDate.getTime() <= now.getTime()) return false;
  return asNumber(credit.remainingAmount?.currencyAmount) > 0;
}

function groupAwsCreditAmounts(credits: CreditData[]) {
  const grouped = new Map<
    string,
    { amount: number; currentPeriodUsedAmount: number }
  >();
  for (const credit of credits) {
    const amount = credit.estimatedAmount ?? credit.remainingAmount;
    const currency = amount?.currencyCode || "USD";
    const groupedAmount = grouped.get(currency) ?? {
      amount: 0,
      currentPeriodUsedAmount: 0,
    };
    const settledRemaining = asNumber(credit.remainingAmount?.currencyAmount);
    const estimatedRemaining = asNumber(amount?.currencyAmount);
    groupedAmount.amount += estimatedRemaining;
    groupedAmount.currentPeriodUsedAmount += Math.max(
      0,
      settledRemaining - estimatedRemaining
    );
    grouped.set(currency, groupedAmount);
  }
  return Array.from(grouped.entries()).map(
    ([currency, amount]): OpsCreditAmount => ({
      ...amount,
      currency,
    })
  );
}

function mapAwsCreditItems(credits: CreditData[]) {
  return credits
    .map(
      (credit): OpsCreditItem => ({
        amount: asNumber(
          (credit.estimatedAmount ?? credit.remainingAmount)?.currencyAmount
        ),
        currency:
          (credit.estimatedAmount ?? credit.remainingAmount)?.currencyCode ||
          "USD",
        expiresAt: credit.endDate?.toISOString() ?? null,
        label: credit.description || credit.creditType || "AWS credit",
      })
    )
    .sort((left, right) =>
      (left.expiresAt ?? "9999").localeCompare(right.expiresAt ?? "9999")
    );
}

async function fetchAwsCredit(): Promise<OpsCreditProviderResult> {
  const label = "AWS Credits";
  const accountId = process.env.AWS_ACCOUNT_ID?.trim();
  if (!hasAwsCredentials() || !accountId) {
    return notConfiguredCredit("aws", label, [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_ACCOUNT_ID",
    ]);
  }

  try {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);

    const client = new BillingClient(getAwsConfig());
    const response = await client.send(
      new GetCreditsCommand({
        accountId,
        endDate: now,
        payerAccountFlag:
          process.env.AWS_PAYER_ACCOUNT_FLAG?.trim().toLowerCase() === "true",
        startDate,
      })
    );
    client.destroy();

    const activeCredits = (response.credits ?? []).filter((credit) =>
      isActiveAwsCredit(credit, now)
    );
    return {
      amounts: groupAwsCreditAmounts(activeCredits),
      id: "aws",
      items: mapAwsCreditItems(activeCredits),
      label,
      message:
        activeCredits.length === 0
          ? "사용 가능한 AWS credit이 없습니다."
          : null,
      status: "ok",
    };
  } catch (error) {
    return failedCredit("aws", label, error);
  }
}

export async function fetchOpsCosts(
  range: DateRange
): Promise<OpsCostResponse> {
  const [
    claude,
    openai,
    openrouter,
    exa,
    ec2,
    browserUse,
    browserless,
    vercel,
    browserUseCredit,
    openrouterCredit,
    awsCredit,
  ] = await Promise.all([
    fetchClaudeCosts(range),
    fetchOpenAiCosts(range),
    fetchOpenRouterCosts(range),
    fetchExaCosts(range),
    fetchEc2Costs(range),
    fetchBrowserUseCosts(range),
    fetchBrowserlessUsage(),
    fetchVercelCosts(range),
    fetchBrowserUseCredit(),
    fetchOpenRouterCredit(),
    fetchAwsCredit(),
  ]);

  return {
    costs: [
      claude,
      openai,
      openrouter,
      exa,
      browserUse,
      browserless,
      ec2,
      vercel,
      supabaseCost(),
    ],
    credits: [openrouterCredit, awsCredit, browserUseCredit],
    from: range.from,
    generatedAt: new Date().toISOString(),
    through: range.through,
    timezone: "UTC",
  };
}
