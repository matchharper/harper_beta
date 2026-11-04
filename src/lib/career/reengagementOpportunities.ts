import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { eligibilitySql } from "@/lib/externalRecommendationsV2/roleSql";
import { sqlLiteral } from "@/lib/talentOnboarding/jobPostingRecommendations";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { formatPromptText } from "@/lib/llm/promptText";
import { readExternalEvaluationResults } from "./matching/externalEvaluationResults";
import { formatCareerMatchingResult } from "./matching/formatters";
import type { CareerPreloadSelection } from "./capabilities/decisions";

export const REENGAGEMENT_OPPORTUNITY_PRELOAD: CareerPreloadSelection = {
  capabilityIds: ["opportunities"],
  handbookIds: ["opportunity_search"],
  status: "selected",
  elapsedMs: 0,
};

// Initial context page, not a publication quota or search/evaluation limit.
const INITIAL_CANDIDATES = 10;
type SearchRun = {
  id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
};
type RoleFact = {
  role_id: string;
  name: string;
  summary?: unknown;
  location_text?: string;
  work_mode?: string;
  salary_range?: unknown;
  external_jd_url?: string;
};
export type ReengagementOpportunitySnapshot = {
  matching: {
    id: string;
    title: string;
    criteria: unknown;
    revision: number;
  } | null;
  latestRun: SearchRun | null;
  lastCompletedRun: SearchRun | null;
  activeRuns: SearchRun[];
  listRevision?: string;
  results?: Awaited<ReturnType<typeof readExternalEvaluationResults>>;
  roleFacts?: RoleFact[];
  legacy?: Array<
    RoleFact & {
      company_name: string;
      fit: Record<string, unknown> | null;
      meta: Record<string, unknown>;
      created_at: string;
      total: number;
    }
  >;
};

export function formatCareerReengagementOpportunities(
  snapshot: ReengagementOpportunitySnapshot
) {
  const run = (label: string, value: SearchRun | null) =>
    value
      ? `${label}: ${value.id}; ${value.status}; started ${formatLlmDateTime(value.created_at)}; finished ${formatLlmDateTime(value.finished_at)}.`
      : `${label}: none recorded.`;
  const lines = [
    "## Available opportunities on this return (times: Asia/Seoul)",
    run("Latest search attempt", snapshot.latestRun),
    run("Last completed search", snapshot.lastCompletedRun),
    ...snapshot.activeRuns.map((value) =>
      run("Search still in progress", value)
    ),
  ];
  if (snapshot.matching) {
    lines.push(
      "Most recently searched active matching. Candidates below have not previously been recommended.",
      formatCareerMatchingResult({
        matching: snapshot.matching,
        listRevision: snapshot.listRevision,
        ...snapshot.results,
      })
    );
  } else {
    lines.push(
      "No active matching with search history. Historical fit cache below is prior evidence, not a new search or a current evaluation reference."
    );
    const legacy = snapshot.legacy ?? [];
    lines.push(
      `Historical candidates: showing ${legacy.length} of ${legacy[0]?.total ?? 0} not previously recommended; ordered by stored fit. Legacy scores and mutual-fit scores are different scales.`
    );
    for (const candidate of legacy) {
      const meta = candidate.meta ?? {};
      lines.push(
        `- role ${candidate.role_id}; ${candidate.company_name} / ${candidate.name}`,
        `  evaluated ${formatLlmDateTime(typeof candidate.fit?.evaluatedAt === "string" ? candidate.fit.evaluatedAt : candidate.created_at)}`,
        candidate.fit
          ? `  Private historical assessment: ${formatPromptText(Object.fromEntries(["mutualFit", "candidateInterest", "companyInterest", "roleFit", "constraintPass", "evidence"].filter((key) => key in candidate.fit!).map((key) => [key, candidate.fit![key]])))}`
          : `  Private historical assessment: ${formatPromptText({ score: meta.score ?? meta.score100 ?? meta.fitScore ?? meta.fit_score, reason: meta.reason ?? meta.fitReason ?? meta.fit_reason ?? meta.fitReasons ?? meta.fit_reasons, summary: meta.fitSummary ?? meta.fit_summary, tradeoff: meta.tradeoff ?? meta.tradeoffs ?? meta.concerns })}`
      );
    }
  }
  for (const role of snapshot.roleFacts ?? snapshot.legacy ?? []) {
    lines.push(
      `Public role facts ${role.role_id}: ${role.name}`,
      ...[role.location_text, role.work_mode, role.external_jd_url]
        .filter(Boolean)
        .map((value) => `  ${value}`)
    );
    if (role.summary)
      lines.push(`  Summary: ${formatPromptText(role.summary)}`);
    if (role.salary_range)
      lines.push(`  Compensation: ${formatPromptText(role.salary_range)}`);
  }
  return lines.join("\n");
}

export async function readCareerReengagementOpportunities(args: {
  admin: TalentAdminClient;
  userId: string;
  blockedCompanies: string[];
}) {
  const owner = `${sqlLiteral(args.userId)}::uuid`;
  const [snapshot] = await executeSql<ReengagementOpportunitySnapshot>(
    args.admin,
    `
    WITH owned AS (
      SELECT r.id,r.status,r.created_at,r.finished_at,r.matching_id,
        CASE WHEN m.id IS NOT NULL THEN jsonb_build_object('id',m.id,'title',m.title,'criteria',m.criteria,'revision',m.revision) END AS matching
      FROM public.external_recommendation_runs r
      LEFT JOIN public.talent_matchings m ON m.id=r.matching_id AND m.talent_id=${owner} AND m.archived_at IS NULL
      WHERE r.talent_id=${owner} AND (r.variant <> 'career_agent' OR m.id IS NOT NULL)
    )
    SELECT
      (SELECT matching FROM owned WHERE matching IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1) AS matching,
      (SELECT to_jsonb(r)-'matching' FROM owned r ORDER BY created_at DESC,id DESC LIMIT 1) AS "latestRun",
      (SELECT to_jsonb(r)-'matching' FROM owned r WHERE status='completed' ORDER BY finished_at DESC NULLS LAST,created_at DESC,id DESC LIMIT 1) AS "lastCompletedRun",
      coalesce((SELECT jsonb_agg(to_jsonb(r)-'matching' ORDER BY created_at DESC,id DESC) FROM owned r WHERE status IN ('queued','running','partial')), '[]'::jsonb) AS "activeRuns"
  `,
    1
  );
  if (!snapshot) throw new Error("Search history was not returned");
  if (snapshot.matching) {
    const [results, revision] = await Promise.all([
      readExternalEvaluationResults({
        ...args,
        matchingId: snapshot.matching.id,
        limit: INITIAL_CANDIDATES,
        excludePreviouslyRecommended: true,
        recommendationCandidates: { blockedCompanies: args.blockedCompanies },
      }),
      args.admin.rpc(
        "career_opportunity_list_revision" as never,
        { p_talent: args.userId, p_matching: snapshot.matching.id } as never
      ),
    ]);
    if (revision.error) throw new Error(revision.error.message);
    snapshot.results = results;
    snapshot.listRevision = revision.data as string;
    if (results.evaluations.length) {
      const { data, error } = await args.admin
        .from("company_roles")
        .select(
          "role_id,name,summary,location_text,work_mode,salary_range,external_jd_url"
        )
        .in(
          "role_id",
          results.evaluations.map((value) => value.role_id)
        );
      if (error) throw new Error(error.message);
      snapshot.roleFacts = data as RoleFact[];
    }
  } else {
    snapshot.legacy = await executeSql<
      NonNullable<ReengagementOpportunitySnapshot["legacy"]>[number]
    >(
      args.admin,
      `
      SELECT cr.role_id,cr.name,cr.summary,cr.location_text,cr.work_mode,cr.salary_range,cr.external_jd_url,
        cw.company_name,cached.value AS fit,f.meta,f.created_at,count(*) OVER () AS total
      FROM public.talent_external_fit f
      JOIN public.company_roles cr ON cr.role_id=f.role_id
      JOIN public.company_workspace cw ON cw.company_workspace_id=cr.company_workspace_id
      LEFT JOIN public.company_db cd ON cd.id=cw.company_db_id
      LEFT JOIN LATERAL (
        SELECT e.value FROM jsonb_each(coalesce(f.evaluations,'{}'::jsonb)) e
        ORDER BY e.value->>'evaluatedAt' DESC,e.key LIMIT 1
      ) cached ON true
      WHERE f.talent_id=${owner} AND ${eligibilitySql(args)}
        AND (cached.value IS NOT NULL OR coalesce(f.meta,'{}'::jsonb)<>'{}'::jsonb)
      ORDER BY (cached.value IS NOT NULL) DESC,
        (cached.value->>'mutualFit')::float DESC NULLS LAST,
        (coalesce(f.meta->>'score',f.meta->>'score100',f.meta->>'fitScore',f.meta->>'fit_score'))::float DESC NULLS LAST,
        cr.role_id
      LIMIT ${INITIAL_CANDIDATES}
    `,
      INITIAL_CANDIDATES
    );
  }
  return formatCareerReengagementOpportunities(snapshot);
}
