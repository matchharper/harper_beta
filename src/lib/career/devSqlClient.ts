import postgres from "postgres";
import { transactionDatabaseUrl } from "@/lib/server/transactionDatabaseUrl";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";
const CAREER_DEV_SQL_DATABASE_ENV_NAMES = [
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
];

let careerDevSqlClient: ReturnType<typeof postgres> | null = null;

function readCareerDevSqlDatabaseUrl() {
  for (const envName of CAREER_DEV_SQL_DATABASE_ENV_NAMES) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }

  if (process.env.NODE_ENV !== "production") {
    const workerEnvPath = path.resolve(process.cwd(), "..", "worker.env");
    if (existsSync(workerEnvPath)) {
      const parsed = parseDotenv(readFileSync(workerEnvPath));
      for (const envName of CAREER_DEV_SQL_DATABASE_ENV_NAMES) {
        const value = parsed[envName]?.trim();
        if (value) return value;
      }
    }
  }

  return null;
}

export function getCareerDevSqlClient() {
  if (careerDevSqlClient) return careerDevSqlClient;

  const databaseUrl = readCareerDevSqlDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      `One of ${CAREER_DEV_SQL_DATABASE_ENV_NAMES.join(
        ", "
      )} is required to execute generated SQL.`
    );
  }

  const sslEnv = process.env.CAREER_DEV_SQL_DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslEnv === "false"
      ? false
      : sslEnv === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;

  careerDevSqlClient = postgres(transactionDatabaseUrl(databaseUrl), {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return careerDevSqlClient;
}
