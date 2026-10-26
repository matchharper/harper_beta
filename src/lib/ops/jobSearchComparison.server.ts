import { countriesSchema } from "../externalRecommendationsV2/countries";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { flattenRpcRows } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { buildJobSearchComparisonSql } from "./jobSearchComparisonSql";
import {
  comparisonRequestSchema,
  defaultComparisonToggles,
  type ComparisonCase,
  type ComparisonResult,
  type ComparisonRow,
} from "./jobSearchComparison";

const fixtureSchema = z.object({
  id: z.string(),
  capturedAt: z.string(),
  failure: z.string(),
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
  countryWeights: countriesSchema.optional(),
  remoteMode: z.enum(["any", "only", "exclude"]).optional(),
  remoteOnlyCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).optional(),
  candidateLimit: z.number().int().min(1).max(3000),
  resultLimit: z.number().int().min(1).max(500),
  vector: z.array(z.number().finite()).length(1536),
  originalSql: z.string().min(1),
  sourceSha256: z.string(),
  filters: z.object({
    postingRecency: z.array(z.string()),
    excludeIntern: z.array(z.string()),
    excludeParttime: z.array(z.string()),
    excludeContract: z.array(z.string()),
    remote: z.array(z.string()),
    eligibility: z.array(z.string()),
  }),
  scores: z.object({
    fts: z.string(),
    salary: z.string(),
    seniority: z.string(),
    postingRecency: z.string(),
  }),
});

async function loadFixtures() {
  const file =
    process.env.JOB_SEARCH_COMPARISON_FIXTURES ||
    path.join(process.cwd(), ".local/job-search-comparison/cases.json");
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    throw new InternalApiError(
      503,
      "이 서버에 비교용 테스트셋이 없습니다. 비공개 캡처로 prepareJobSearchComparison.py를 실행해 주세요."
    );
  }
  return z.array(fixtureSchema).parse(JSON.parse(content));
}

export async function listJobSearchComparisonCases(): Promise<
  ComparisonCase[]
> {
  return (await loadFixtures()).map((fixture) => {
    const available = {
      ...defaultComparisonToggles,
      countries: true,
      companyCap: true,
    };
    for (const key of Object.keys(
      fixture.filters
    ) as (keyof typeof fixture.filters)[])
      available[key] = fixture.filters[key].length > 0;
    for (const key of Object.keys(
      fixture.scores
    ) as (keyof typeof fixture.scores)[])
      available[key] ||=
        fixture.scores[key] !== "0" && fixture.scores[key] !== "(0.5)";
    return {
      id: fixture.id,
      capturedAt: fixture.capturedAt,
      failure: fixture.failure,
      countries: fixture.countries,
      candidateLimit: fixture.candidateLimit,
      resultLimit: fixture.resultLimit,
      available,
    };
  });
}

export async function runJobSearchComparison(
  input: unknown,
  signal?: AbortSignal
): Promise<ComparisonResult> {
  const parsed = comparisonRequestSchema.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);
  const request = parsed.data;
  const fixture = (await loadFixtures()).find(
    (row) => row.id === request.caseId
  );
  if (!fixture)
    throw new InternalApiError(404, "테스트 사례를 찾을 수 없습니다.");
  const sql =
    request.mode === "original"
      ? fixture.originalSql
      : buildJobSearchComparisonSql(fixture, request.toggles);
  const result: ComparisonResult = {
    request,
    startedAt: new Date().toISOString(),
    databaseMs: 0,
    rows: [],
    counts: { filtered: null, candidates: null },
    sql: sql.replaceAll(
      JSON.stringify(fixture.vector),
      "[저장된 임베딩 1536개 값 생략]"
    ),
    error: null,
  };
  const started = performance.now();
  try {
    const query = getSupabaseAdmin().rpc("search_external_roles_filter_first", {
      p_sql: sql,
    });
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    if (error) throw new Error(error.message);
    const payload = flattenRpcRows(data);
    const comparison =
      request.mode === "toggles"
        ? (payload[0] as {
            rows: ComparisonRow[];
            candidate_count: number;
            filtered_count: number;
          })
        : null;
    const rows = comparison ? comparison.rows : payload;
    if (comparison)
      result.counts = {
        candidates: Number(comparison.candidate_count),
        filtered: Number(comparison.filtered_count),
      };
    // Do not return full descriptions or private capture metadata to the UI.
    result.rows = (rows as ComparisonRow[]).map(
      ({
        role_id,
        role_name,
        company_name,
        country_code,
        title_similarity,
        search_rank,
        fts_score,
        salary_utility,
      }) => ({
        role_id,
        role_name,
        company_name,
        country_code,
        title_similarity,
        search_rank,
        fts_score,
        salary_utility,
      })
    );
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "검색에 실패했습니다.";
  } finally {
    result.databaseMs = performance.now() - started;
  }
  return result;
}
