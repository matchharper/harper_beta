import postgres from "postgres";
import { transactionDatabaseUrl } from "@/lib/server/transactionDatabaseUrl";
import type { Row } from "./evidence";

export type Query = (text: string, params?: any[]) => Promise<Row[]>;
export type Database = {
  query: Query;
  transaction: <T>(work: (query: Query) => Promise<T>) => Promise<T>;
};
let client: ReturnType<typeof postgres> | undefined;

export function pythonTimestamp(value: string): string {
  return value
    .replace(" ", "T")
    .replace(/Z$/, "+00:00")
    .replace(/([+-]\d\d)$/, "$1:00")
    .replace(/(\.\d+)(?=[+-]\d\d:\d\d$)/, (fraction) =>
      fraction
        .slice(1)
        .split("")
        .every((c) => c === "0")
        ? ""
        : fraction.padEnd(7, "0")
    );
}

/** Existing server DB credentials; never invoke the Python worker or its queue. */
export function internalScoringDatabase(): Database {
  if (!client) {
    const url =
      process.env.DATABASE_URL?.trim() ||
      process.env.CAREER_ROLE_SEARCH_DATABASE_URL?.trim();
    if (!url) throw new Error("Internal evaluation database is unavailable");
    client = postgres(transactionDatabaseUrl(url), {
      max: 18,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 20,
      connection: { TimeZone: "UTC" },
      ...(/supabase\.(co|com)|pooler\.supabase/i.test(url)
        ? { ssl: "require" as const }
        : {}),
      types: {
        // Query uses SQL-ready JSON strings, as does the PGlite adapter. The
        // driver's default JSON serializer would encode those strings again.
        json: {
          to: 114,
          from: [114, 3802],
          serialize: (value: unknown) =>
            typeof value === "string" ? value : JSON.stringify(value),
          parse: JSON.parse,
        },
        timestamp: {
          to: 1184,
          from: [1184],
          serialize: String,
          parse: pythonTimestamp,
        },
        date: { to: 1082, from: [1082], serialize: String, parse: String },
        numeric: { to: 1700, from: [1700], serialize: String, parse: Number },
        bigint: {
          to: 20,
          from: [20],
          serialize: String,
          parse: (value: string) => {
            const number = Number(value);
            if (!Number.isSafeInteger(number))
              throw new Error("Scoring integer exceeds JavaScript exact range");
            return number;
          },
        },
      },
    });
  }
  return {
    query: async (text, params = []) =>
      Array.from(await client!.unsafe(text, params)),
    transaction: async <T>(work: (query: Query) => Promise<T>) =>
      (await client!.begin(async (tx) =>
        work(async (text, params = []) =>
          Array.from(await tx.unsafe(text, params))
        )
      )) as T,
  };
}
