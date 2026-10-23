import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

/**
 * Direct SQL for the role start fast path (pgvector math and set-based
 * filters that PostgREST cannot express). Authorization happens before any
 * call through the regular Role access checks.
 */
export function roleStartSql() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("Role start database is unavailable");
  client = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 30,
    max: 6,
    prepare: false,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
      ? { ssl: "require" as const }
      : {}),
  });
  return client;
}
