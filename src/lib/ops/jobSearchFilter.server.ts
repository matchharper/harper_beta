import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { embedSearchTitles } from "@/lib/externalRecommendationsV2/retrieval";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import {
  jobSearchFilterRequestSchema,
  type JobSearchFilterResult,
} from "./jobSearchFilter";
import { buildJobSearchFilterSql } from "./jobSearchFilterSql";

// Only vectors are cached, never role results or hard-filter eligibility.
const vectors = new Map<string, { vector: number[]; expires: number }>();
const runtime = {
  embedSearchTitles,
  async execute(sql: string, signal?: AbortSignal) {
    const request = getSupabaseAdmin().rpc(
      "search_external_roles_filter_first",
      {
        p_sql: sql,
      }
    );
    const { data, error } = await (signal
      ? request.abortSignal(signal)
      : request);
    if (error) throw new Error(error.message);
    return flattenRpcRows(data)[0] as Pick<
      JobSearchFilterResult,
      "rows" | "counts" | "timings"
    >;
  },
};

export async function runJobSearchFilter(
  input: unknown,
  signal?: AbortSignal,
  dependencies = runtime
): Promise<JobSearchFilterResult> {
  const parsed = jobSearchFilterRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);
  const request = parsed.data;
  const began = performance.now();
  const result: JobSearchFilterResult = {
    rows: [],
    counts: { candidates: 0 },
    timings: { candidateSearchMs: 0, rerankMs: 0 },
    request,
    sql: "",
    embeddingReused: false,
    embeddingMs: 0,
    databaseMs: 0,
    totalMs: 0,
    error: null,
  };
  try {
    signal?.throwIfAborted();
    const key = JSON.stringify(request.query.plan.roleTitles);
    const hit = vectors.get(key);
    let vector = hit && hit.expires > Date.now() ? hit.vector : undefined;
    result.embeddingReused = Boolean(vector);
    if (!vector) {
      const started = performance.now();
      try {
        [vector] = await dependencies.embedSearchTitles(
          request.query.plan.roleTitles,
          signal
        );
      } finally {
        result.embeddingMs = performance.now() - started;
      }
      if (vectors.size >= 32) vectors.delete(vectors.keys().next().value!);
      vectors.set(key, { vector, expires: Date.now() + 30 * 60_000 });
    }
    result.sql = buildJobSearchFilterSql({
      ...request,
      vector,
      userId: request.talentId ?? "",
    });
    const started = performance.now();
    try {
      const payload = await dependencies.execute(result.sql, signal);
      if (!payload || !Array.isArray(payload.rows))
        throw new Error("검색 결과를 받지 못했습니다.");
      result.rows = payload.rows;
      result.counts = payload.counts;
      result.timings = payload.timings;
    } finally {
      result.databaseMs = performance.now() - started;
    }
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "검색에 실패했습니다.";
  }
  result.totalMs = performance.now() - began;
  return result;
}
