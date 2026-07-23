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
  providerLabel: string
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const detail = getRemoteErrorMessage(payload);
      throw new Error(
        `${providerLabel} API ${response.status}${detail ? `: ${detail}` : ""}`
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${providerLabel} API 응답 시간이 초과되었습니다.`);
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
    total: 0,
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
    total: 0,
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
    let page = "";

    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      const query = new URLSearchParams({
        bucket_width: "1d",
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
        const cents = asArray(bucket.results).reduce(
          (sum, rawResult) => sum + asNumber(asRecord(rawResult).amount),
          0
        );
        amounts.set(date, (amounts.get(date) ?? 0) + cents / 100);
      }

      page = asString(payload.next_page);
      if (!payload.has_more || !page) break;
    }

    return successfulCost("claude", label, pointsFromMap(amounts));
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
    let page = "";

    for (let requestCount = 0; requestCount < 10; requestCount += 1) {
      const query = new URLSearchParams({
        bucket_width: "1d",
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
        const amount = asArray(bucket.results).reduce((sum, rawResult) => {
          const result = asRecord(rawResult);
          return sum + asNumber(asRecord(result.amount).value);
        }, 0);
        amounts.set(date, (amounts.get(date) ?? 0) + amount);
      }

      page = asString(payload.next_page);
      if (!payload.has_more || !page) break;
    }

    return successfulCost("openai", label, pointsFromMap(amounts));
  } catch (error) {
    return failedCost("openai", label, error);
  }
}

async function fetchGrokCosts(range: DateRange) {
  const label = "Grok";
  const managementKey = process.env.XAI_MANAGEMENT_API_KEY?.trim();
  const teamId = process.env.XAI_TEAM_ID?.trim();
  if (!managementKey || !teamId) {
    return notConfiguredCost("grok", label, [
      "XAI_MANAGEMENT_API_KEY",
      "XAI_TEAM_ID",
    ]);
  }

  try {
    const payload = asRecord(
      await fetchJson(
        `https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(
          teamId
        )}/usage`,
        {
          body: JSON.stringify({
            analyticsRequest: {
              filters: [],
              groupBy: [],
              timeRange: {
                endTime: `${range.through} 23:59:59`,
                startTime: `${range.from} 00:00:00`,
                timezone: "Etc/GMT",
              },
              timeUnit: "TIME_UNIT_DAY",
              values: [{ aggregation: "AGGREGATION_SUM", name: "usd" }],
            },
          }),
          headers: {
            Authorization: `Bearer ${managementKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        },
        label
      )
    );

    const amounts = new Map<string, number>();
    for (const rawSeries of asArray(payload.timeSeries)) {
      for (const rawPoint of asArray(asRecord(rawSeries).dataPoints)) {
        const point = asRecord(rawPoint);
        const date = asString(point.timestamp).slice(0, 10);
        if (!date) continue;
        const amount = asNumber(asArray(point.values)[0]);
        amounts.set(date, (amounts.get(date) ?? 0) + amount);
      }
    }

    return successfulCost("grok", label, pointsFromMap(amounts));
  } catch (error) {
    return failedCost("grok", label, error);
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

async function fetchDeepSeekCredit(): Promise<OpsCreditProviderResult> {
  const label = "DeepSeek";
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return notConfiguredCredit("deepseek", label, ["DEEPSEEK_API_KEY"]);
  }

  try {
    const payload = asRecord(
      await fetchJson(
        "https://api.deepseek.com/user/balance",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        label
      )
    );
    const amounts = asArray(payload.balance_infos).map((rawBalance) => {
      const balance = asRecord(rawBalance);
      return {
        amount: asNumber(balance.total_balance),
        currency: asString(balance.currency) || "USD",
        grantedAmount: asNumber(balance.granted_balance),
        toppedUpAmount: asNumber(balance.topped_up_balance),
      };
    });

    return {
      amounts,
      id: "deepseek",
      items: [],
      label,
      message:
        payload.is_available === false
          ? "현재 API 호출에 사용할 수 없는 잔액입니다."
          : null,
      status: "ok",
    };
  } catch (error) {
    return failedCredit("deepseek", label, error);
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
    const settledRemaining = asNumber(
      credit.remainingAmount?.currencyAmount
    );
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
  const [claude, openai, grok, exa, ec2, deepseekCredit, awsCredit] =
    await Promise.all([
      fetchClaudeCosts(range),
      fetchOpenAiCosts(range),
      fetchGrokCosts(range),
      fetchExaCosts(range),
      fetchEc2Costs(range),
      fetchDeepSeekCredit(),
      fetchAwsCredit(),
    ]);

  return {
    costs: [claude, openai, grok, exa, ec2],
    credits: [deepseekCredit, awsCredit],
    from: range.from,
    generatedAt: new Date().toISOString(),
    through: range.through,
    timezone: "UTC",
  };
}
