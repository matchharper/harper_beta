import { InternalApiError } from "@/lib/internalApi";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { loadExternalContext } from "@/lib/externalRecommendationsV2/context";
import { getSearchPlan } from "@/lib/externalRecommendationsV2/engine";
import { retrieveRoles } from "@/lib/externalRecommendationsV2/retrieval";
import { annualSalaryKrw } from "@/lib/externalRecommendationsV2/salary";
import {
  fingerprint,
  SEARCH_PLAN_VERSION,
} from "@/lib/externalRecommendationsV2/contract";
import {
  externalSearchPreviewRequest,
  type ExternalSearchPreviewResult,
} from "./externalSearchPreview";

// Ops repeats the same inspection; normal worker planning still runs each time.
// Cache completed plans only. Never cache role rows or eligibility decisions.
export function createPreviewPlanCache(plan = getSearchPlan, now = Date.now) {
  const cache = new Map<
    string,
    { expires: number; value: Awaited<ReturnType<typeof getSearchPlan>> }
  >();
  return async (...[args, loaded]: Parameters<typeof getSearchPlan>) => {
    const key = fingerprint({
      userId: args.userId,
      context: loaded.contextFingerprint,
      savedDefault: loaded.setting?.external_search_default,
      version: SEARCH_PLAN_VERSION,
    });
    const hit = cache.get(key);
    if (hit && hit.expires > now()) {
      args.signal?.throwIfAborted();
      return { ...structuredClone(hit.value), planCall: false };
    }
    cache.delete(key);
    const value = await plan(args, loaded);
    args.signal?.throwIfAborted();
    for (const [k, v] of cache) if (v.expires <= now()) cache.delete(k);
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, {
      expires: now() + 5 * 60_000,
      value: structuredClone(value),
    });
    return value;
  };
}

const runtime = {
  getSupabaseAdmin,
  loadExternalContext,
  getSearchPlan: createPreviewPlanCache(),
  retrieveRoles,
};

// Only plan + initial retrieval. Do not enter the fit/fill/save/delivery pipeline.
export async function previewExternalSearch(
  input: unknown,
  signal?: AbortSignal,
  dependencies = runtime
): Promise<ExternalSearchPreviewResult> {
  const parsed = externalSearchPreviewRequest.safeParse(input);
  if (!parsed.success)
    throw new InternalApiError(400, parsed.error.issues[0].message);
  const userId = parsed.data.talentId;
  const admin = dependencies.getSupabaseAdmin();
  const loaded = await dependencies.loadExternalContext(admin, userId);
  signal?.throwIfAborted();
  const plan = await dependencies.getSearchPlan(
    {
      admin,
      userId,
      surface: "worker",
      language: "ko",
      dryRun: true,
      signal,
    },
    loaded
  );
  signal?.throwIfAborted();
  const { rows } = await dependencies.retrieveRoles({
    admin,
    userId,
    plan: plan.plan,
    vectors: plan.titleVectors,
    targetSalaryKrw: plan.targetSalaryKrw,
    blockedCompanies: loaded.blockedCompanies,
    limit: 500,
    listOnly: true,
    signal,
  });
  signal?.throwIfAborted();
  return {
    rows: rows.map((row) => {
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
      };
    }),
  };
}
