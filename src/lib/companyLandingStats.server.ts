import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { CompanyLandingStats } from "./companyLandingStats";

// Use the same server connection configuration as Career's company job index.
const DATABASE_ENV_NAMES = [
  "CAREER_ROLE_SEARCH_DATABASE_URL",
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
] as const;
let client: ReturnType<typeof postgres> | null = null;

function getStatsClient() {
  if (client) return client;
  let databaseUrl = DATABASE_ENV_NAMES.map((name) =>
    process.env[name]?.trim()
  ).find(Boolean);
  if (!databaseUrl && process.env.NODE_ENV !== "production") {
    const envPath = path.resolve(process.cwd(), "..", "worker.env");
    if (existsSync(envPath)) {
      const env = parseDotenv(readFileSync(envPath));
      databaseUrl = DATABASE_ENV_NAMES.map((name) => env[name]?.trim()).find(
        Boolean
      );
    }
  }
  if (!databaseUrl) {
    throw new Error("Company landing statistics database is unavailable");
  }
  const sslSetting =
    process.env.CAREER_ROLE_SEARCH_DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslSetting === "false"
      ? false
      : sslSetting === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;
  client = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return client;
}

// Source populations are aggregated only by the daily database job.
export async function readCompanyLandingStats(
  db = getStatsClient()
): Promise<CompanyLandingStats> {
  const [row] = await db<CompanyLandingStats[]>`
    SELECT
      talent_count::double precision AS "talentCount",
      average_conversation_messages AS "averageConversationMessages",
      assessed_pair_count::double precision AS "assessedPairCount",
      to_char(updated_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
    FROM public.company_landing_stats
    WHERE name = 'current'
  `;
  if (!row) throw new Error("Company landing statistics snapshot is unavailable");
  return row;
}
