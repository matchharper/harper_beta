import { roleTitleNeighborsSql } from "./roleTitleSearchSql";
import { buildFilterFirstRoleSql } from "./filterFirstSql";
import { z } from "zod";
import { searchTitleText } from "./searchTitles";
import { type V2SearchPlan } from "./countries";
import { recordDirectUsage } from "./usage";
import {
  sqlLiteral,
  flattenRpcRows,
  type RawRoleRow,
} from "../talentOnboarding/jobPostingRecommendations";
import type { TalentAdminClient } from "../talentOnboarding/admin";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export class TitleEmbeddingHttpError extends Error {
  constructor(readonly status: number) {
    super(`Title embedding HTTP ${status}`);
  }
}
export async function embedTitles(
  titles: string[],
  signal?: AbortSignal,
  onUsage?: (usage: unknown, elapsedMs: number) => void
): Promise<number[][]> {
  if (!titles.length) return [];
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OpenAI embedding credential");
  const began = Date.now();
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: titles,
      dimensions: 1536,
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(45_000)])
      : AbortSignal.timeout(45_000),
  });
  const body = await response.json();
  if (!response.ok) throw new TitleEmbeddingHttpError(response.status);
  onUsage?.(body.usage, Date.now() - began);
  await recordDirectUsage(
    "embeddings",
    EMBEDDING_MODEL,
    body.usage,
    Date.now() - began
  );
  const rows = (body.data ?? []).sort((a: any, b: any) => a.index - b.index);
  if (rows.length !== titles.length) throw new Error("Missing title embedding");
  return rows.map((r: any) => {
    if (
      !Array.isArray(r.embedding) ||
      r.embedding.length !== 1536 ||
      !r.embedding.every(
        (n: unknown) => typeof n === "number" && Number.isFinite(n)
      )
    )
      throw new Error("Invalid title embedding");
    return r.embedding as number[];
  });
}
export function embedSearchTitles(
  titles: string[],
  signal?: AbortSignal,
  onUsage?: (usage: unknown, elapsedMs: number) => void
) {
  return embedTitles([searchTitleText(titles)], signal, onUsage);
}

export type TitleNeighbor = {
  title_key: string;
  title: string;
  distance: number;
};
export function titleNeighborsSql(rows: TitleNeighbor[]) {
  return `SELECT * FROM jsonb_to_recordset(${sqlLiteral(JSON.stringify(rows))}::jsonb) AS n(title_key text,title text,distance double precision)`;
}
// ANN and role expansion each have their own bounded read. Combining both can
// exceed the RPC timeout even when each stage finishes within its budget.
export async function fetchTitleNeighbors(
  admin: TalentAdminClient,
  vector: number[],
  signal?: AbortSignal,
  onSql?: (sql: string) => void
) {
  if (vector.length !== 1536 || !vector.every(Number.isFinite))
    throw new Error("Invalid vector");
  const sql = `SELECT coalesce(jsonb_agg(n),'[]'::jsonb) AS title_neighbors FROM (
      ${roleTitleNeighborsSql(sqlLiteral(JSON.stringify(vector)))}) n`;
  onSql?.(sql);
  const request = admin.rpc(
    "search_external_roles_v2" as never,
    {
      // One JSON row avoids PostgREST's result-row cap truncating the 5,000 titles.
      p_sql: sql,
    } as never
  );
  const { data, error } = await (signal
    ? request.abortSignal(signal)
    : request);
  if (error) throw new Error(`External title search: ${error.message}`);
  return z
    .array(
      z.object({
        title_key: z.string(),
        title: z.string(),
        distance: z.number().finite(),
      })
    )
    .parse(flattenRpcRows(data));
}

export { eligibilitySql, ROLE_SELECT, ROLE_JOINS } from "./roleSql";
export function buildHybridSql(args: {
  plan: V2SearchPlan;
  vectors: number[][];
  userId: string;
  blockedCompanies: string[];
  limit: 200 | 500;
  template?: boolean;
  targetSalaryKrw?: number | null;
  salaryWeight?: number;
  listOnly?: boolean;
}) {
  if (args.vectors.length !== 1)
    throw new Error("Expected one combined search-title embedding");
  return buildFilterFirstRoleSql({ ...args, vector: args.vectors[0] });
}
export async function executeSql<T = RawRoleRow>(
  admin: TalentAdminClient,
  sql: string,
  limit = 500
): Promise<T[]> {
  const { data, error } = await admin.rpc(
    "set_timeout_and_execute_raw_sql" as never,
    { sql_query: sql, limit_num: limit, offset_num: 0, page_idx: 0 } as never
  );
  if (error) throw new Error(error.message);
  return flattenRpcRows(data) as T[];
}
export async function retrieveRoles(args: {
  admin: TalentAdminClient;
  plan: V2SearchPlan;
  userId: string;
  blockedCompanies: string[];
  limit?: number;
  excludeRoleIds?: string[];
  asOf?: string | null;
  vectors?: number[][];
  targetSalaryKrw?: number | null;
  listOnly?: boolean;
  signal?: AbortSignal;
}) {
  // The RPC has a 50s DB budget. Do not race it with the admin client's
  // default 50s fetch abort; allow time for PostgREST to return its result.
  // Include embedding and at most one read-only retry in the 120s route budget.
  const budget = AbortSignal.timeout(110_000);
  const signal = args.signal ? AbortSignal.any([args.signal, budget]) : budget;
  signal.throwIfAborted();
  const vectors =
    args.vectors ?? (await embedSearchTitles(args.plan.roleTitles, signal));
  if (vectors.length !== 1)
    throw new Error("Expected one combined search-title embedding");
  signal.throwIfAborted();
  const sql = buildFilterFirstRoleSql({ ...args, vector: vectors[0] });
  for (let attempt = 0; ; attempt++) {
    const requestDeadline = AbortSignal.timeout(60_000);
    const { data, error } = await args.admin
      .rpc("search_external_roles_filter_first", { p_sql: sql })
      .abortSignal(AbortSignal.any([signal, requestDeadline]));
    // Caller cancellation and the total budget must never launch another read.
    signal.throwIfAborted();
    if (!error) return { rows: flattenRpcRows(data) as RawRoleRow[], sql };
    const timedOut =
      error.code === "57014" ||
      requestDeadline.aborted ||
      error.message.startsWith("AbortError:");
    if (attempt > 0 || !timedOut)
      throw new Error(`External role retrieval: ${error.message}`);
    console.warn(
      "[external-recommendations] retrying timed-out role retrieval",
      {
        code: error.code,
      }
    );
  }
}
