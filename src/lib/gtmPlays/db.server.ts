import "server-only";

import postgres from "postgres";
import { transactionDatabaseUrl } from "@/lib/server/transactionDatabaseUrl";

let client: ReturnType<typeof postgres> | null = null;

/** Direct SQL for GTM aggregates that PostgREST cannot express. Callers check internal access first. */
function gtmSql() {
  if (client) return client;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("GTM database is unavailable");
  client = postgres(transactionDatabaseUrl(databaseUrl), {
    connect_timeout: 10,
    idle_timeout: 30,
    max: 3,
    prepare: false,
    ...(/supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
      ? { ssl: "require" as const }
      : {}),
  });
  return client;
}

export type GtmReadSql = postgres.TransactionSql;

/** Every aggregate runs in a read-only transaction: a GTM read can never change data. */
export async function gtmRead<T>(run: (sql: GtmReadSql) => Promise<T>): Promise<T> {
  return (await gtmSql().begin("read only", (sql) => run(sql))) as T;
}

export type GtmWriteSql = postgres.TransactionSql;

/**
 * Small writes PostgREST cannot express atomically: merging one key into a jsonb column other code writes at
 * the same time (a read-modify-write through the API would drop their change). Callers check access first.
 */
export async function gtmWrite<T>(run: (sql: GtmWriteSql) => Promise<T>): Promise<T> {
  return (await gtmSql().begin((sql) => run(sql))) as T;
}
