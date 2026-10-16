import { randomUUID } from "node:crypto";
import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { loadExternalContext } from "@/lib/externalRecommendationsV2/context";
import {
  getSearchPlan,
  v2CompletionRequest,
} from "@/lib/externalRecommendationsV2/engine";
import {
  embedSearchTitles,
  EMBEDDING_MODEL,
} from "@/lib/externalRecommendationsV2/retrieval";
import { directUsageCost } from "@/lib/externalRecommendationsV2/usage";
import { annualSalaryKrw } from "@/lib/externalRecommendationsV2/salary";
import { fingerprint } from "@/lib/externalRecommendationsV2/contract";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  flattenRpcRows,
  type RawRoleRow,
} from "@/lib/talentOnboarding/jobPostingRecommendations";
import { createLlmDebugCall } from "@/lib/llm/debugUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { buildJobSearchFilterSql } from "./jobSearchFilterSql";
import {
  externalSearchPreviewRequest,
  previewQuerySchema,
  type ExternalSearchPreviewResult,
} from "./externalSearchPreview";

// Cache only query vectors, never eligibility or role results. Bounded and user scoped.
export function createPreviewVectorCache(now = Date.now) {
  const entries = new Map<string, { expires: number; vectors: number[][] }>();
  const key = (userId: string, titles: string[]) =>
    fingerprint({ userId, titles, model: EMBEDDING_MODEL });
  return {
    get(userId: string, titles: string[]) {
      const k = key(userId, titles),
        hit = entries.get(k);
      if (hit && hit.expires > now()) return structuredClone(hit.vectors);
      entries.delete(k);
    },
    set(userId: string, titles: string[], vectors: number[][]) {
      for (const [k, v] of entries) if (v.expires <= now()) entries.delete(k);
      if (entries.size >= 64) entries.delete(entries.keys().next().value!);
      entries.set(key(userId, titles), {
        expires: now() + 5 * 60_000,
        vectors: structuredClone(vectors),
      });
    },
  };
}
const vectorsCache = createPreviewVectorCache();
const runtime = {
  getSupabaseAdmin,
  loadExternalContext,
  getSearchPlan,
  embedSearchTitles,
  complete: runTalentAssistantCompletion,
  vectorsCache,
  async execute(
    admin: ReturnType<typeof getSupabaseAdmin>,
    sql: string,
    signal?: AbortSignal
  ): Promise<unknown[]> {
    const request = admin.rpc(
      "search_external_roles_filter_first" as never,
      { p_sql: sql } as never
    );
    const { data, error } = await (signal
      ? request.abortSignal(signal)
      : request);
    if (error) throw new Error(error.message);
    return flattenRpcRows(data);
  },
};

export async function previewExternalSearch(
  input: unknown,
  signal?: AbortSignal,
  dependencies = runtime
): Promise<ExternalSearchPreviewResult> {
  const parsed = externalSearchPreviewRequest.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);
  const request = parsed.data,
    userId = request.talentId;
  const began = performance.now();
  const result: ExternalSearchPreviewResult = {
    action: request.action,
    method: request.method,
    candidateLimit: request.candidateLimit,
    salaryWeight: request.salaryWeight,
    query: request.query ?? null,
    rows: [],
    rawOutput: null,
    calls: [],
    modelCallsStarted: 0,
    timings: [],
    totalMs: 0,
    sql: [],
    counts: {},
    embeddingReused: false,
    error: null,
  };
  async function timed<T>(label: string, work: () => Promise<T>) {
    const start = performance.now();
    let status: "ok" | "error" = "error";
    try {
      signal?.throwIfAborted();
      const value = await work();
      signal?.throwIfAborted();
      status = "ok";
      return value;
    } finally {
      result.timings.push({
        label,
        ms: performance.now() - start,
        status,
        scope: "request",
      });
    }
  }
  const embed: typeof embedSearchTitles = (titles, abort) =>
    timed("검색 제목 임베딩 생성", () => {
      result.modelCallsStarted++;
      return dependencies.embedSearchTitles(
        titles,
        abort,
        (usage, durationMs) => {
          const cost = directUsageCost("embeddings", usage);
          const call = createLlmDebugCall({
            model: EMBEDDING_MODEL,
            response: { usage },
            durationMs,
            step: "제목 임베딩",
          });
          result.calls.push({
            ...call,
            estimatedCostUsd: cost.usd,
            pricingStatus: cost.status,
          });
        }
      );
    });
  return withLlmUsageContext(
    {
      requestId: randomUUID(),
      userId,
      careerOrigin: "server",
      careerCapability: { name: "ops_external_search" },
    },
    async () => {
      try {
        const admin = dependencies.getSupabaseAdmin();
        const loaded = await timed("사용자 검색 맥락 조회", () =>
          dependencies.loadExternalContext(admin, userId)
        );
        if (request.action === "prepare") {
          const generated = await dependencies.getSearchPlan(
            {
              admin,
              userId,
              surface: "worker",
              language: "ko",
              dryRun: true,
              signal,
            },
            loaded,
            (system, input, label, abort) =>
              timed("LLM query 생성", async () => {
                const start = performance.now();
                const completion = v2CompletionRequest(system, input, label);
                result.modelCallsStarted++;
                const raw = await dependencies.complete({
                  ...completion,
                  usageLabel: "ops:external-search:plan",
                  abortSignal: abort
                    ? AbortSignal.any([abort, completion.abortSignal!])
                    : completion.abortSignal,
                  onUsage: (metadata) =>
                    result.calls.push(
                      createLlmDebugCall({
                        model: metadata.model,
                        response: { usage: metadata.usage },
                        durationMs: performance.now() - start,
                        step: "검색 계획",
                      })
                    ),
                });
                result.rawOutput = raw;
                return JSON.parse(raw);
              }),
            embed
          );
          result.query = previewQuerySchema.parse({
            plan: generated.plan,
            targetSalaryKrw: generated.targetSalaryKrw ?? null,
          });
          result.embeddingReused = !result.calls.some(
            (c) => c.step === "제목 임베딩"
          );
          dependencies.vectorsCache.set(
            userId,
            generated.plan.roleTitles,
            generated.titleVectors
          );
        } else {
          const query = request.query!;
          result.query = query;
          let vectors = dependencies.vectorsCache.get(
            userId,
            query.plan.roleTitles
          );
          result.embeddingReused = Boolean(vectors);
          if (!vectors) {
            vectors = await embed(query.plan.roleTitles, signal);
            dependencies.vectorsCache.set(
              userId,
              query.plan.roleTitles,
              vectors
            );
          }
          const sql = buildJobSearchFilterSql({
            query,
            vector: vectors[0],
            userId,
            blockedCompanies: loaded.blockedCompanies,
            candidateLimit: request.candidateLimit,
            salaryWeight: request.salaryWeight,
          });
          result.sql.push({ label: "필터·HNSW·FTS·연봉 실행 SQL", text: sql });
          const [payload] = (await timed("검색 SQL 왕복", () =>
            dependencies.execute(admin, sql, signal)
          )) as {
            rows: RawRoleRow[];
            counts: Record<string, number>;
            timings: Record<string, number>;
          }[];
          if (!payload || !Array.isArray(payload.rows))
            throw new Error("검색 결과를 받지 못했습니다.");
          const rows = payload.rows;
          result.counts = payload.counts;
          for (const [key, label] of [
            ["candidateSearchMs", "1. 하드 필터·HNSW 후보 검색"],
            ["rerankMs", "2. FTS·연봉 정렬 + 500개 조회"],
          ]) {
            result.timings.push({
              label,
              ms: payload.timings[key],
              scope: "database",
              status: "ok",
            });
          }
          result.rows = rows.map((row) => {
            if (!row.role_id || !row.role_name)
              throw new Error("검색 결과의 공고 정보가 올바르지 않습니다.");
            const salary = annualSalaryKrw(row);
            return {
              roleId: row.role_id,
              company: row.company_name ?? "—",
              title: row.role_name,
              location: row.location_text ?? null,
              url: row.external_jd_url ?? null,
              salaryMinKrw: salary.min,
              salaryMaxKrw: salary.max,
              salaryText: row.salary_range ?? null,
              salaryIsPredicted: row.salary_is_predicted === true,
              score: row.search_rank ?? null,
            };
          });
        }
      } catch (error) {
        // Keep SQL, completed stages and paid-call receipts inspectable on a timeout.
        result.error =
          error instanceof Error
            ? error.message
            : "검색을 완료하지 못했습니다.";
      } finally {
        result.totalMs = performance.now() - began;
      }
      return result;
    }
  );
}
