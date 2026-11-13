import "server-only";

import postgres from "postgres";
import { DEFAULT_ADMIN_EXCLUDED_EMAILS } from "@/lib/adminEmailExclusions";
import { transactionDatabaseUrl } from "@/lib/server/transactionDatabaseUrl";
import {
  buildJobsConversion,
  kstPeriodStart,
  type JobsConversionDays,
  type JobsConversionQueryRow,
  type OpsOfficialJobsConversion,
} from "./officialJobsConversion";
import {
  excludedEmailParam,
  JOBS_CONVERSION_SQL,
  OFFICIAL_JOB_SIGNUPS_SQL,
} from "./officialJobsConversion.sql";

let client: ReturnType<typeof postgres> | null = null;

/**
 * Direct SQL for /ops/jobs numbers that join events, login rows and accounts (PostgREST cannot
 * express the joins). Callers check internal access first; every query runs read-only.
 */
function statsSql() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("Official jobs statistics database is unavailable");
  }
  client = postgres(transactionDatabaseUrl(databaseUrl), {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 2,
    prepare: false,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
      ? { ssl: "require" as const }
      : {}),
  });
  return client;
}

async function readOnly<T>(
  query: string,
  parameters: string[]
): Promise<T[]> {
  const rows = await statsSql().begin("read only", async (sql) => {
    // A slow plan must not hold a pooler connection until the function times out.
    await sql.unsafe("set local statement_timeout = '15s'");
    return sql.unsafe(query, parameters);
  });
  return rows as unknown as T[];
}

const excludedEmails = () => excludedEmailParam(DEFAULT_ADMIN_EXCLUDED_EMAILS);

export async function fetchOpsOfficialJobsConversion(
  days: JobsConversionDays,
  now = new Date()
): Promise<OpsOfficialJobsConversion> {
  const periodStart = kstPeriodStart(days, now);
  const rows = await readOnly<JobsConversionQueryRow>(JOBS_CONVERSION_SQL, [
    periodStart.toISOString(),
    excludedEmails(),
  ]);
  return buildJobsConversion({ days, periodStart, generatedAt: now, rows });
}

/** People who signed up after viewing this job, in this browser or in another one they moved to. */
export async function countOfficialJobSignups(jobId: string): Promise<number> {
  const rows = await readOnly<{ signups: number | string | null }>(
    OFFICIAL_JOB_SIGNUPS_SQL,
    [jobId, excludedEmails()]
  );
  const signups = Number(rows[0]?.signups ?? 0);
  return Number.isFinite(signups) ? signups : 0;
}
