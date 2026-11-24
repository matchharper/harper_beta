import { z } from "zod";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  fitSchema,
  legacyFitSchema,
  rankScore,
} from "@/lib/externalRecommendationsV2/contract";
import { executeSql } from "@/lib/externalRecommendationsV2/retrieval";
import { sqlLiteral } from "@/lib/sqlLiteral";
import type { CareerHistoryOpportunity } from "@/components/career/types";

/**
 * Opportunities like one this person opened, without evaluating anything new: the
 * other postings already scored for them in the same matching (or, without a
 * matching, the same search run), reordered by how close each company is to the
 * opened one so that different opportunities surface different neighbours.
 */
export const SIMILAR_OPPORTUNITY_LIMIT = 6;
const COMPANY_SIMILARITY_WEIGHT = 0.5;
// Matchings hold about 600 options at the median and 1,100 at p90 (2026-11-24).
const MAX_POOL_ROWS = 5000;

export type SimilarOpportunity = {
  opportunity: CareerHistoryOpportunity;
  fitScore: number;
  companySimilarity: number | null;
};

type CandidateRow = {
  role_id: string;
  company_workspace_id: string;
  fit: unknown;
  latest_score: number | null;
  company_similarity: number | null;
};

const anyFit = z.union([legacyFitSchema, fitSchema]);

function scoreOf(row: CandidateRow) {
  if (row.latest_score !== null) return row.latest_score;
  const fit = anyFit.safeParse(row.fit);
  return fit.success ? rankScore(fit.data) : null;
}

/** Postgres percent_rank: the share of values strictly below each value. */
function percentRanks(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const below = new Map<number, number>();
  sorted.forEach((value, index) => {
    if (!below.has(value)) below.set(value, index);
  });
  const span = Math.max(values.length - 1, 1);
  return values.map((value) => (below.get(value) ?? 0) / span);
}

/** Every option already scored for this person next to the opened one, with its company's closeness. One request. */
export async function fetchSimilarCandidates(
  admin: TalentAdminClient,
  args: { userId: string; targetId: string; targetKind: "role" | "company" }
) {
  const user = `${sqlLiteral(args.userId)}::uuid`;
  const role = args.targetKind === "role" ? `${sqlLiteral(args.targetId)}::uuid` : "null::uuid";
  const workspace = args.targetKind === "company" ? `${sqlLiteral(args.targetId)}::uuid` : "null::uuid";
  const isTarget = (alias: string) =>
    `(${alias}.role_id = ${role} or (${role} is null and ${alias}.role_id is null and ${alias}.company_workspace_id = ${workspace}))`;
  return executeSql<CandidateRow>(
    admin,
    `
    with seed as (
      select w.company_workspace_id, w.company_db_id, s.embedding
      from public.company_workspace w
      left join public.career_company_search s on s.company_workspace_id = w.company_workspace_id
      where w.company_workspace_id = coalesce(
        (select r.company_workspace_id from public.company_roles r where r.role_id = ${role}), ${workspace})
    ), own as (
      -- This person's evaluations of the opened opportunity itself.
      select e.run_id, e.evaluated_at from public.talent_external_evaluations e
      where e.talent_id = ${user} and ${isTarget("e")}
    ), seed_matching as (
      select m.matching_id from (
        select c.matching_id, c.updated_at as seen_at from public.talent_matching_candidates c
        where c.talent_id = ${user} and ${isTarget("c")}
        union all
        select x.matching_id, o.evaluated_at from own o
        join public.external_recommendation_runs x on x.id = o.run_id
        where x.matching_id is not null and x.talent_id = ${user}
      ) m order by m.seen_at desc nulls last limit 1
    ), seed_run as (
      select o.run_id from own o where o.run_id is not null order by o.evaluated_at desc limit 1
    ), pool as (
      select c.role_id, c.latest_evaluation_id as evaluation_id, c.latest_score
      from public.talent_matching_candidates c join seed_matching using (matching_id)
      where c.role_id is not null
      union all
      select * from (
        select distinct on (e.role_id) e.role_id, e.id as evaluation_id, null::real as latest_score
        from public.talent_external_evaluations e join seed_run using (run_id)
        where e.talent_id = ${user} and e.role_id is not null
          and not exists (select 1 from seed_matching)
        order by e.role_id, e.evaluated_at desc
      ) run_siblings
    )
    select p.role_id, r.company_workspace_id, e.assessment->'fit' as fit, p.latest_score,
      case when cs.embedding is not null and seed.embedding is not null
        then 1 - (cs.embedding operator(public.<=>) seed.embedding) end as company_similarity
    from pool p
    cross join seed
    join public.company_roles r on r.role_id = p.role_id
    join public.company_workspace w on w.company_workspace_id = r.company_workspace_id
    -- The matching already keeps each option's score; only run siblings need their evaluation read.
    left join public.talent_external_evaluations e on e.id = p.evaluation_id and p.latest_score is null
    left join public.career_company_search cs on cs.company_workspace_id = r.company_workspace_id
    where r.company_workspace_id <> seed.company_workspace_id
      and (w.company_db_id is null or seed.company_db_id is null or w.company_db_id <> seed.company_db_id)
      and not coalesce(w.is_internal, false)
      and r.source_type = 'external'
      and coalesce(r.source_provider, '') <> 'user_submitted'
      and coalesce(r.information->>'testOnly', 'false') <> 'true'
      and coalesce(r.is_expired, false) = false
      and lower(trim(coalesce(r.status, 'active'))) not in (
        'archived', 'closed', 'deleted', 'ended', 'expired', 'inactive'
      )
      and (r.expires_at is null or r.expires_at >= now())
      and not exists (
        select 1 from public.talent_opportunity_recommendation t
        where t.talent_id = ${user} and t.role_id = p.role_id
      )
  `,
    MAX_POOL_ROWS
  );
}

/** Score and company closeness as percentile ranks, mixed half and half, one posting per company. */
export function rankSimilarCandidates(rows: CandidateRow[], limit = SIMILAR_OPPORTUNITY_LIMIT) {
  const scored = rows.flatMap((row) => {
    const score = scoreOf(row);
    return score === null ? [] : [{ row, score }];
  });
  if (!scored.length) return [];
  const scoreRanks = percentRanks(scored.map((item) => item.score));
  const similarityRanks = percentRanks(
    scored.map((item) => item.row.company_similarity ?? -1)
  );
  const best = new Map<string, (typeof scored)[number] & { blend: number }>();
  scored.forEach((item, index) => {
    const blend =
      (1 - COMPANY_SIMILARITY_WEIGHT) * scoreRanks[index] +
      COMPANY_SIMILARITY_WEIGHT * similarityRanks[index];
    const current = best.get(item.row.company_workspace_id);
    if (!current || blend > current.blend)
      best.set(item.row.company_workspace_id, { ...item, blend });
  });
  return [...best.values()]
    .sort((a, b) => b.blend - a.blend || b.score - a.score)
    .slice(0, limit);
}

export async function fetchSimilarOpportunities(args: {
  admin: TalentAdminClient;
  locale?: string | null;
  targetId: string;
  targetKind: "role" | "company";
  userId: string;
}): Promise<SimilarOpportunity[]> {
  const rows = await fetchSimilarCandidates(args.admin, args);
  // Rank a few extra so postings that turn out closed can drop without shrinking the list.
  const ranked = rankSimilarCandidates(rows, SIMILAR_OPPORTUNITY_LIMIT * 2);
  if (!ranked.length) return [];
  const { fetchTalentPostingCardsByRoleIds, isExpiredOpportunityRole } =
    await import("@/lib/talentOpportunity");
  const cards = await fetchTalentPostingCardsByRoleIds({
    admin: args.admin,
    locale: args.locale,
    roleIds: ranked.map((item) => item.row.role_id),
    userId: args.userId,
  });
  const byRoleId = new Map(cards.map((card) => [card.roleId, card]));
  return ranked
    .flatMap((item) => {
      const opportunity = byRoleId.get(item.row.role_id);
      if (
        !opportunity ||
        isExpiredOpportunityRole({
          expiresAt: opportunity.expiresAt,
          isExpired: opportunity.isExpired,
          status: opportunity.status,
        })
      )
        return [];
      return [
        {
          opportunity,
          fitScore: Math.round(item.score),
          companySimilarity:
            item.row.company_similarity === null
              ? null
              : Number(item.row.company_similarity),
        },
      ];
    })
    .slice(0, SIMILAR_OPPORTUNITY_LIMIT);
}
