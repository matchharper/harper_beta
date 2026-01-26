import { StatusEnum, SummaryScore } from "@/types/type";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";
import { ensureGroupBy } from "@/utils/textprocess";

export const UI_START = "<<UI>>";
export const UI_END = "<<END_UI>>";

function ensurePercentLike(token: string): string {
  let t = token.trim();
  if (!t.startsWith("%")) t = "%" + t;
  if (!t.endsWith("%")) t = t + "%";
  return t;
}

function expandIlikePipes(sql: string): string {
  // Matches: <lhs> ILIKE '<literal>'
  // lhs: e.g. p.published_at, ex.role, T1.bio ...
  // literal: any chars except single quote
  const ilikeLiteralRe = /([A-Za-z_][\w.]*)\s+ILIKE\s+'([^']*)'/gi;

  return sql.replace(ilikeLiteralRe, (full, lhs: string, lit: string) => {
    if (!lit.includes("|")) return full;

    const parts = lit
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts.length === 0) return full;

    const ors = parts
      .map((p) => `${lhs} ILIKE '${ensurePercentLike(p)}'`)
      .join(" OR ");

    return `(${ors})`;
  });
}

function extractFirstTsQuery(sql: string): string | null {
  // Find first: to_tsquery('english', '<QUERY>')
  const toTsqueryRe = /to_tsquery\(\s*'english'\s*,\s*'([^']*)'\s*\)/i;

  const m = sql.match(toTsqueryRe);
  return m ? m[1] : null;
}

function appendOrderBy(sql: string, tsQuery: string): string {
  const orderBy = `\nORDER BY T1.id, ts_rank(fts, to_tsquery('english', '${tsQuery}')) DESC`;

  const trimmed = sql.trimEnd();
  if (trimmed.endsWith(";")) {
    return trimmed.slice(0, -1).trimEnd() + orderBy + ";\n";
  }
  return trimmed + orderBy + "\n";
}

export function transformSql(sql: string): string {
  // 1) expand ILIKE pipes
  let out = expandIlikePipes(sql);

  // 2) append ORDER BY based on the first to_tsquery
  const tsQuery = extractFirstTsQuery(out);
  if (!tsQuery) return out;

  out = appendOrderBy(out, tsQuery);
  return out;
}

export type ScoredCandidate = { id: string; score: number };

export function scoreFromLabel(line: string): number {
  const s = (line ?? "").trim();
  if (s.startsWith(SummaryScore.SATISFIED)) return 2;
  if (s.startsWith(SummaryScore.AMBIGUOUS)) return 1;
  // "불만족" 또는 그 외
  return 0;
}

export function sumScore(lines: string[]): number {
  if (!Array.isArray(lines)) return 0;
  let total = 0;
  for (const line of lines) total += scoreFromLabel(line);
  return Math.max(Math.min(total, 200), 0);
}

/**
 * Runs async mapper with concurrency limit.
 * Returns results in the same order as input.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * 중복된 결과를 제거하고, 점수를 높은 순서대로 정렬하는 함수
 */
export function deduplicateAndScore(
  results1: ScoredCandidate[],
  results2: ScoredCandidate[]
) {
  const mergedScores = [...results1, ...results2];
  const deduped = Array.from(
    mergedScores.reduce((map, item) => {
      const prev = map.get(item.id);
      if (!prev || item.score > prev.score) {
        map.set(item.id, item);
      }
      return map;
    }, new Map<string, { id: string; score: number }>())
  ).map(([, value]) => value);
  deduped.sort((a, b) => b.score - a.score);

  return deduped;
}

export const updateRunStatus = async (runId: string, status: string) => {
  // logger.log("\n updateRunStatus: ", runId, status);
  await supabase.from("runs").update({ status }).eq("id", runId);
};

export const makeJoinQuery = (tables: string[]) => {
  let coalesce = ``
  if (tables.includes('edu_user')) {
    coalesce += `COALESCE(edu.data, '[]'::jsonb) AS edu_user,`
  }
  if (tables.includes('experience_user')) {
    coalesce += `\nCOALESCE(exp.data, '[]'::jsonb) AS experience_user,`
  }
  if (tables.includes('publications')) {
    coalesce += `\nCOALESCE(pub.data, '[]'::jsonb) AS publications,`
  }
  if (tables.includes('extra_experience')) {
    coalesce += `\nCOALESCE(ext.data, '[]'::jsonb) AS extra_experience,`
  }
  coalesce = coalesce.slice(0, -1);

  let leftJoin = ``
  if (tables.includes('edu_user')) {
    leftJoin += `
LEFT JOIN LATERAL (
SELECT jsonb_agg(to_jsonb(e)) AS data FROM edu_user e WHERE e.candid_id = i.id
) edu ON TRUE`
  }
  if (tables.includes('experience_user')) {
    leftJoin += `
LEFT JOIN LATERAL (
SELECT jsonb_agg(to_jsonb(ex) || jsonb_build_object('company_db', to_jsonb(comp))) AS data 
FROM experience_user ex 
LEFT JOIN company_db comp ON comp.id = ex.company_id 
WHERE ex.candid_id = i.id
) exp ON TRUE`
  }
  if (tables.includes('publications')) {
    leftJoin += `
LEFT JOIN LATERAL (
SELECT jsonb_agg(to_jsonb(p)) AS data FROM publications p WHERE p.candid_id = i.id
) pub ON TRUE`
  }
  if (tables.includes('extra_experience')) {
    leftJoin += `
LEFT JOIN LATERAL (
SELECT jsonb_agg(to_jsonb(ee)) AS data FROM extra_experience ee WHERE ee.candid_id = i.id
) ext ON TRUE`
  }

  return { coalesce, leftJoin }
}

export const updateQuery = async ({ sql, runId }: { sql: string, runId: string }) => {
  return await supabase
    .from("runs")
    .update({ sql_query: sql as string })
    .eq("id", runId);
}

export const deduplicateCandidates = (candidates: ScoredCandidate[]) => {
  const deduped = Array.from(
    new Map(candidates.map(item => [item.id, item])).values()
  );
  return deduped;
}

export async function assertNotCanceled(runId: string) {
  const { data, error } = await supabase
    .from("runs")
    .select("status")
    .eq("id", runId)
    .single();

  if (error) throw error;

  if (data.status === StatusEnum.STOPPED) {
    await supabase.from("runs").update({ status: StatusEnum.STOPPED }).eq("id", runId);
    const e = new Error("RUN_STOPPED");
    (e as any).code = "RUN_STOPPED";
    throw e;
  }
}
