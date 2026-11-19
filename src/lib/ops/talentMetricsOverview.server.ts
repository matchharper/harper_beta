import "server-only";
import { listTestTalentAccountEmails } from "@/lib/testAccounts";

import postgres from "postgres";
import { attributeTalentSignups } from "@/lib/growthTalentGtmReport";
import {
  NOT_SUBMITTED_SENTENCE,
  SUBMITTED_SENTENCE,
} from "@/lib/gtmPlays/demand.server";
import { transactionDatabaseUrl } from "@/lib/server/transactionDatabaseUrl";
import type { OpsTalentMetricInterval } from "@/lib/ops/talentMetrics";
import {
  buildOpsTalentMetricsOverview,
  type OpsTalentMetricsOverviewResponse,
  type OverviewApplicationRow,
  type OverviewJobRow,
  type OverviewPendingRow,
  type OverviewSignupRow,
  type OverviewTrendRow,
} from "@/lib/ops/talentMetricsOverview";
import {
  OVERVIEW_ACCOUNT_SIGN_INS_SQL,
  OVERVIEW_APPLICATIONS_SQL,
  OVERVIEW_OFFICIAL_JOBS_SQL,
  OVERVIEW_PENDING_CONNECTIONS_SQL,
  OVERVIEW_SIGNUPS_SQL,
  OVERVIEW_TREND_SQL,
} from "@/lib/ops/talentMetricsOverview.sql";
import { parseOpsTalentMetricsRange } from "@/lib/ops/talentMetricsServer";

const CACHE_TTL_MS = 2 * 60 * 1_000;
const RESPONSE_CACHE_LIMIT = 12;
const responseCache = new Map<
  string,
  { expiresAt: number; value: OpsTalentMetricsOverviewResponse }
>();

let client: ReturnType<typeof postgres> | null = null;

/** Direct read-only SQL: the joins across logs, mail sends and browser runs are beyond PostgREST. */
function overviewSql() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Talent 지표 데이터베이스 연결이 설정되지 않았습니다.");
  }
  client = postgres(transactionDatabaseUrl(databaseUrl), {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 3,
    prepare: false,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
      ? { ssl: "require" as const }
      : {}),
  });
  return client;
}

export async function readOnly<T>(query: string, parameters: unknown[]): Promise<T[]> {
  const rows = await overviewSql().begin("read only", async (sql) => {
    await sql.unsafe("set local statement_timeout = '90s'");
    return sql.unsafe(query, parameters as postgres.ParameterOrJSON<never>[]);
  });
  return rows as unknown as T[];
}

export async function fetchOpsTalentMetricsOverview(args: {
  excludedEmails?: string[];
  from: string;
  interval?: OpsTalentMetricInterval;
  to: string;
}): Promise<OpsTalentMetricsOverviewResponse> {
  const range = parseOpsTalentMetricsRange(args.from, args.to);
  const interval = args.interval ?? "week";
  const excludedEmails = Array.from(
    new Set(
      // Test accounts never count as talents.
      [...(args.excludedEmails ?? []), ...(await listTestTalentAccountEmails())]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
  const cacheKey = JSON.stringify({ excludedEmails, interval, range });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const generatedAt = new Date();
  const period = [
    range.from,
    range.to,
    interval,
    excludedEmails,
    SUBMITTED_SENTENCE,
    NOT_SUBMITTED_SENTENCE,
  ];
  // Attribution reads its own rows: start it as soon as the signups are known, beside the slower activity scan.
  const signupsWithAttribution = readOnly<OverviewSignupRow>(
    OVERVIEW_SIGNUPS_SQL,
    period
  ).then(async (signups) => ({
    attribution: await attributeTalentSignups({
      excludedEmails,
      readAccountSignIns: ({ emails, endIso, startIso }) =>
        readOnly<{ created_at: string; local_id: string | null; type: string }>(
          OVERVIEW_ACCOUNT_SIGN_INS_SQL,
          [emails, startIso, endIso]
        ),
      signups: signups
        .filter((row) => row.isCurrent)
        .map((row) => ({
          at: new Date(row.signedUpAt).toISOString(),
          userId: row.userId,
        })),
    }),
    signups,
  }));
  const [{ attribution, signups }, trendRows, applications, pending, jobs] =
    await Promise.all([
      signupsWithAttribution,
      readOnly<OverviewTrendRow>(OVERVIEW_TREND_SQL, period),
      readOnly<OverviewApplicationRow>(OVERVIEW_APPLICATIONS_SQL, period),
      readOnly<OverviewPendingRow>(OVERVIEW_PENDING_CONNECTIONS_SQL, [
        excludedEmails,
      ]),
      readOnly<OverviewJobRow>(OVERVIEW_OFFICIAL_JOBS_SQL, []),
    ]);
  const value = buildOpsTalentMetricsOverview({
    applications,
    attribution,
    filters: { from: range.from, interval, to: range.to },
    generatedAt,
    jobs,
    pending,
    signups,
    trendRows,
  });
  if (responseCache.size >= RESPONSE_CACHE_LIMIT) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
  return value;
}
