import { sqlLiteral } from "@/lib/sqlLiteral";

/** These are durable company progress tags, shared with the detail reader. */
export const INTERNAL_PROGRESS_STAGES = {
  "내부:수락": "accepted",
  "내부:아카이브": "archived",
  "내부:연결됨": "connected",
  "내부:최종오퍼": "final_offer",
  "내부:보류": "hold",
  "내부:연결대기": "pending_connection",
  "내부:프로세스중단": "process_stopped",
  "내부:거절": "rejected",
} as const;

export const historyPredicates = {
  new: "list_position = 'current' AND (feedback IS NULL OR feedback = 'dislike') AND saved_stage IS DISTINCT FROM 'hidden'",
  saved:
    "(feedback IN ('like','keep') OR (feedback IS NULL AND saved_stage = 'hidden'))",
  archived: "list_position = 'previous'",
};

/** Owner-scoped, read-only projection. Resolve each historical ID once, not once
 * per recommendation per membership. Materialization lasts only for this query. */
export function careerOpportunityIndexSql(userId: string) {
  const owner = `${sqlLiteral(userId)}::uuid`;
  const tags = Object.entries(INTERNAL_PROGRESS_STAGES)
    .map(([tag, stage]) => `WHEN ${sqlLiteral(tag)} THEN ${sqlLiteral(stage)}`)
    .join(" ");
  return `WITH owned AS MATERIALIZED (
    SELECT id,talent_id,role_id,opportunity_type,created_at,feedback,feedback_at,saved_stage,viewed_at
    FROM public.talent_opportunity_recommendation WHERE talent_id=${owner}
  ), intro_targets AS MATERIALIZED (
    SELECT DISTINCT ON(t.role_id) t.role_id,t.id,t.created_at
    FROM public.company_intro_candidates i JOIN owned t
      ON t.id=i.recommendation_id AND t.talent_id=i.talent_id AND t.role_id=i.role_id AND t.opportunity_type='intro_request'
    WHERE i.talent_id=${owner} ORDER BY t.role_id,t.created_at DESC,t.id DESC
  ), resolved AS MATERIALIZED (
    SELECT o.*,CASE WHEN coalesce(o.opportunity_type,'')<>'intro_request' AND t.created_at>=o.created_at
      THEN t.id ELSE o.id END AS current_id
    FROM owned o LEFT JOIN intro_targets t ON t.role_id=o.role_id
  ), members AS MATERIALIZED (
    SELECT DISTINCT ON(m.matching_id,r.current_id) m.id,m.matching_id,r.current_id AS recommendation_id,
      m.explanation,m.archived_at,m.updated_at
    FROM public.talent_opportunity_memberships m JOIN resolved r ON r.id=m.recommendation_id AND r.talent_id=m.talent_id
    WHERE m.talent_id=${owner}
    ORDER BY m.matching_id,r.current_id,(m.recommendation_id=r.current_id) DESC,m.updated_at DESC,m.id DESC
  ), positions AS MATERIALIZED (
    SELECT recommendation_id,bool_or(archived_at IS NULL) AS current,
      (array_agg(explanation ORDER BY (archived_at IS NULL) DESC,updated_at DESC,id))[1] AS explanation
    FROM members GROUP BY recommendation_id
  ), progress AS MATERIALIZED (
    SELECT DISTINCT ON(t.opportunity_id) t.opportunity_id,
      CASE lower(trim(t.tag)) ${tags} ELSE 'custom' END AS stage
    FROM public.talent_opportunity_tag t
    WHERE t.talent_id=${owner} AND (lower(trim(t.tag)) IN (${Object.keys(INTERNAL_PROGRESS_STAGES).map(sqlLiteral).join(",")})
      OR lower(trim(t.tag)) LIKE '내부단계:%')
    ORDER BY t.opportunity_id,t.updated_at DESC
  ), normalized AS MATERIALIZED (
    SELECT r.id,r.role_id,r.feedback,r.feedback_at,r.created_at,r.viewed_at,
      CASE WHEN c.source_type='external' THEN 'external' ELSE 'internal' END AS source_type,c.status,
      CASE WHEN r.opportunity_type IN ('external_jd','internal_recommendation','intro_request') THEN r.opportunity_type
        WHEN c.source_type='external' THEN 'external_jd' ELSE 'internal_recommendation' END AS opportunity_type,
      CASE WHEN r.saved_stage IN ('saved','applied','connected','offer','closed','hidden') THEN r.saved_stage END AS stored_stage,
      CASE WHEN coalesce(p.current,false) THEN 'current' ELSE 'previous' END AS list_position,p.explanation AS list_explanation,
      progress.stage AS progress_stage
    FROM resolved r JOIN public.company_roles c ON c.role_id=r.role_id
    JOIN public.company_workspace w ON w.company_workspace_id=c.company_workspace_id
    LEFT JOIN positions p ON p.recommendation_id=r.id LEFT JOIN progress ON progress.opportunity_id=r.role_id
    WHERE r.id=r.current_id
  ), effective AS (
    SELECT n.*,CASE
      WHEN source_type='internal' AND feedback IS NULL AND lower(trim(status))='ended' THEN 'hidden'
      WHEN source_type='internal' AND feedback='like' AND stored_stage IS NULL AND
        (progress_stage IN ('process_stopped','archived','rejected') OR
          (lower(status) IN ('ended','deleted') AND progress_stage IS DISTINCT FROM 'final_offer')) THEN 'closed'
      ELSE stored_stage END AS saved_stage
    FROM normalized n
  )`;
}

export const historyStageSql =
  "coalesce(saved_stage,CASE WHEN source_type='internal' OR opportunity_type IN ('internal_recommendation','intro_request') THEN 'connected' ELSE 'saved' END)";
export const historyCountsSql = `SELECT jsonb_build_object(
  'total',count(*),'new',count(*) FILTER(WHERE ${historyPredicates.new}),
  'newInternal',count(*) FILTER(WHERE ${historyPredicates.new} AND source_type='internal' AND feedback IS NULL),
  'newExternalUnread',count(*) FILTER(WHERE ${historyPredicates.new} AND source_type='external' AND viewed_at IS NULL),
  'saved',count(*) FILTER(WHERE ${historyPredicates.saved}),
  'archived',count(*) FILTER(WHERE ${historyPredicates.archived}),
  'savedStages',jsonb_build_object(${[
    "saved",
    "applied",
    "connected",
    "offer",
    "closed",
    "hidden",
  ]
    .map(
      (stage) =>
        `${sqlLiteral(stage)},count(*) FILTER(WHERE ${historyPredicates.saved} AND ${historyStageSql}=${sqlLiteral(stage)})`
    )
    .join(",")})
) AS counts FROM effective`;

export function historySelectionSql(args: {
  historyTab?: "new" | "saved" | "archived";
  search?: boolean;
  savedStage?: string;
  sourceType?: string;
  ids?: string[];
  roleIds?: string[];
  feedback?: string | null;
  limit?: number;
  offset?: number;
  latestFirst?: boolean;
}) {
  const where = ["true"];
  if (args.search) where.push(`(${historyPredicates.archived} OR ${historyPredicates.saved})`);
  if (args.historyTab) where.push(historyPredicates[args.historyTab]);
  if (args.savedStage)
    where.push(
      `${historyStageSql} ${args.savedStage === "all" ? "<> 'hidden'" : `= ${sqlLiteral(args.savedStage)}`}`
    );
  if (args.sourceType) where.push(`source_type=${sqlLiteral(args.sourceType)}`);
  if (args.ids)
    where.push(`id=ANY(ARRAY[${args.ids.map(sqlLiteral).join(",")}]::uuid[])`);
  if (args.roleIds)
    where.push(
      `role_id=ANY(ARRAY[${args.roleIds.map(sqlLiteral).join(",")}]::uuid[])`
    );
  if ("feedback" in args)
    where.push(
      args.feedback === null
        ? "feedback IS NULL"
        : `feedback=${sqlLiteral(args.feedback!)}`
    );
  const order = args.latestFirst
    ? "created_at DESC,id"
    : args.historyTab === "new"
      ? "(source_type='internal') DESC,CASE opportunity_type WHEN 'intro_request' THEN 0 WHEN 'internal_recommendation' THEN 1 ELSE 2 END,created_at DESC,id"
      : args.historyTab === "saved"
        ? "coalesce(feedback_at,created_at) DESC,created_at DESC,id"
        : "created_at DESC,id";
  // Limits/offsets are consumed by SQL, so reject non-integral values here.
  for (const value of [args.limit, args.offset])
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
      throw new Error("Invalid history page boundary");
  return `SELECT id,role_id,list_position,list_explanation,saved_stage FROM effective WHERE ${where.join(" AND ")}
    ORDER BY ${order}${args.limit === undefined ? "" : ` LIMIT ${args.limit}`}${args.offset ? ` OFFSET ${args.offset}` : ""}`;
}
