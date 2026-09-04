import postgres from "postgres";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";
import {
  getInternalRolePublishedName,
  maskInternalRoleSearchKeywords,
} from "@/lib/career/internalRoleCompanyAliases";
import {
  isPostingRoleId,
  normalizePostingRoleId,
} from "@/lib/career/postingLinks";

const DATABASE_ENV_NAMES = [
  "CAREER_ROLE_SEARCH_DATABASE_URL",
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
] as const;
const INTERNAL_ROLE_SEARCH_LIMIT = 10;
const INTERNAL_ROLE_SEARCH_STATEMENT_TIMEOUT_MS = 120000;
const MAX_KEYWORD_COUNT = 2;
const MAX_FALLBACK_KEYWORD_COUNT = 8;
const INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND =
  "candidate_requested_connection";

type InternalRoleSearchSqlRow = {
  candidate_feedback: string | null;
  candidate_saved_stage: string | null;
  company_name: string | null;
  company_process_started: boolean;
  has_priority_review_request: boolean;
  has_reconsideration_scheduled: boolean;
  is_internal: boolean;
  latest_recommendation_id: string | null;
  location_text: string | null;
  official_job_company_name: string | null;
  published_name: string | null;
  candidate_fit: string | null;
  company_fit: string | null;
  fit_reason: string | null;
  role_fit: string | null;
  role_id: string;
  role_title: string;
  same_company_formal_roles: unknown;
  type: string[] | null;
  work_mode: string | null;
};

type SameCompanyFormalRole = {
  formalRecommendationState: "unanswered" | "accepted" | "declined" | "closed";
  roleId: string;
  roleTitle: string;
};

type MatchedInternalRoleSourceSqlRow = {
  candidate_feedback: string | null;
  candidate_saved_stage: string | null;
  company_process_started: boolean;
  latest_recommendation_id: string | null;
  role_id: string;
  role_title: string;
  source_process_inactive: boolean;
};

export type InternalRoleSearchResultRole = {
  formalRecommendationState:
    | "not_presented"
    | "unanswered"
    | "accepted"
    | "declined"
    | "closed";
  id: string;
  role: string;
  sameCompanyFormalRoles?: SameCompanyFormalRole[];
  selectionContext?: string;
};

export type InternalRoleSearchResult = {
  assistantInstruction: string;
  fallbackKeywords?: string[];
  fallbackUsed: boolean;
  keywords: string[];
  newOptionCount?: number;
  requestedKeywords: string[];
  returnedCount: number;
  roles: InternalRoleSearchResultRole[];
  sourceRelationship?: string;
  sourceRoleId?: string;
  mode: "lookup" | "matched";
};

let internalRoleSearchClient: ReturnType<typeof postgres> | null = null;

function readDatabaseUrl() {
  for (const envName of DATABASE_ENV_NAMES) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }

  if (process.env.NODE_ENV !== "production") {
    const workerEnvPath = path.resolve(process.cwd(), "..", "worker.env");
    if (existsSync(workerEnvPath)) {
      const parsed = parseDotenv(readFileSync(workerEnvPath));
      for (const envName of DATABASE_ENV_NAMES) {
        const value = parsed[envName]?.trim();
        if (value) return value;
      }
    }
  }

  return null;
}

function getInternalRoleSearchClient() {
  if (internalRoleSearchClient) return internalRoleSearchClient;

  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(`${DATABASE_ENV_NAMES.join(", ")} is required.`);
  }

  const sslEnv =
    process.env.CAREER_ROLE_SEARCH_DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslEnv === "false"
      ? false
      : sslEnv === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;

  internalRoleSearchClient = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return internalRoleSearchClient;
}

function normalizeKeywords(value: unknown) {
  const rawValues = Array.isArray(value) ? value : [value];
  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of rawValues) {
    const text = String(rawValue ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(text.slice(0, 120));
    if (keywords.length >= MAX_KEYWORD_COUNT) break;
  }

  return keywords;
}

function splitKeywordsForFallback(keywords: readonly string[]) {
  const splitKeywords: string[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords) {
    for (const term of keyword.split(/\s+/)) {
      const text = term.trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase("ko-KR");
      if (seen.has(key)) continue;
      seen.add(key);
      splitKeywords.push(text.slice(0, 120));
      if (splitKeywords.length >= MAX_FALLBACK_KEYWORD_COUNT) {
        return splitKeywords;
      }
    }
  }

  return splitKeywords;
}

function hasSameKeywords(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  return left.every(
    (keyword, index) =>
      keyword.toLocaleLowerCase("ko-KR") ===
      right[index]?.toLocaleLowerCase("ko-KR")
  );
}

function formatText(
  value: string | null | undefined,
  fallback = "unknown",
  maxChars?: number
) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return fallback;
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}...`;
}

function getFormalRecommendationState(
  row: InternalRoleSearchSqlRow
): InternalRoleSearchResultRole["formalRecommendationState"] {
  if (!row.latest_recommendation_id) return "not_presented";
  if (row.candidate_saved_stage === "closed") return "closed";
  if (["like", "positive"].includes(String(row.candidate_feedback ?? ""))) {
    return "accepted";
  }
  if (["dislike", "negative"].includes(String(row.candidate_feedback ?? ""))) {
    return "declined";
  }
  return "unanswered";
}

function normalizeSameCompanyFormalRoles(value: unknown) {
  if (!Array.isArray(value)) return [];
  const roles: SameCompanyFormalRole[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const roleId = String(record.roleId ?? "").trim();
    const roleTitle = String(record.roleTitle ?? "").trim();
    const state = String(record.formalRecommendationState ?? "").trim();
    if (
      !roleId ||
      !roleTitle ||
      !["unanswered", "accepted", "declined", "closed"].includes(state)
    ) {
      continue;
    }
    roles.push({
      formalRecommendationState:
        state as SameCompanyFormalRole["formalRecommendationState"],
      roleId,
      roleTitle,
    });
  }
  return roles;
}

function getCandidateVisibleCompanyName(row: InternalRoleSearchSqlRow) {
  return getInternalRolePublishedName(
    row.official_job_company_name ?? row.published_name
  );
}

function formatInternalRole(
  row: InternalRoleSearchSqlRow,
  sameCompanyFormalRoles: SameCompanyFormalRole[]
) {
  const formalRecommendationState = getFormalRecommendationState(row);
  const candidateState = formalRecommendationState === "not_presented"
    ? "Formal recommendation: no"
    : formalRecommendationState === "closed"
      ? "Candidate response: previous selection closed"
      : formalRecommendationState === "accepted"
        ? "Candidate response: accepted"
        : formalRecommendationState === "declined"
          ? "Candidate response: declined"
          : "Candidate response: not answered";
  const companyState = row.company_process_started
    ? "Company process: already started"
    : row.latest_recommendation_id && row.candidate_saved_stage !== "closed"
      ? "Company process: not started"
      : null;
  const parts = [
    `Role title: ${formatText(row.role_title)}`,
    `Company: ${getCandidateVisibleCompanyName(row)}`,
    `Location: ${formatText(row.location_text)}`,
    candidateState,
    companyState,
    row.has_priority_review_request ? "검토요청/선호전달됨" : null,
    row.has_reconsideration_scheduled
      ? "Scheduled for reconsideration"
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
}

function formatPrivateSelectionContext(row: InternalRoleSearchSqlRow) {
  const parts = [
    `A role fit: ${formatText(row.role_fit)}`,
    `B candidate preference fit: ${formatText(row.candidate_fit)}`,
    `C company fit: ${formatText(row.company_fit)}`,
    row.fit_reason
      ? `Reason: ${formatText(row.fit_reason, "", 700)}`
      : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" | ");
}

function formatMatchedSourceRelationship(
  row: MatchedInternalRoleSourceSqlRow | undefined
) {
  if (!row) return null;
  const candidateState = !row.latest_recommendation_id
    ? "no formal recommendation"
    : row.candidate_saved_stage === "closed"
      ? "previous selection closed"
      : ["like", "positive"].includes(String(row.candidate_feedback ?? ""))
        ? "candidate accepted"
        : ["dislike", "negative"].includes(String(row.candidate_feedback ?? ""))
          ? "candidate declined"
          : "candidate has not answered";
  const directChangeState = !row.latest_recommendation_id
    ? "direct replacement unavailable"
    : row.candidate_saved_stage === "closed"
      ? "direct replacement unavailable"
      : row.source_process_inactive
        ? "previous process is inactive; same-company recommendation change unavailable"
        : row.company_process_started
          ? "company process already started; same-company recommendation change unavailable"
          : "company process not started; a verified alternative can be added for review without acceptance";
  return `Source role: ${formatText(row.role_title)} | ${candidateState} | ${directChangeState}`;
}

async function searchInternalRoleRows(args: {
  db: ReturnType<typeof getInternalRoleSearchClient>;
  keywords: string[];
  userId: string;
}) {
  return (await args.db.begin(async (tx) => {
    await tx.unsafe(
      `set local statement_timeout = '${INTERNAL_ROLE_SEARCH_STATEMENT_TIMEOUT_MS}ms'`
    );
    return tx<InternalRoleSearchSqlRow[]>`
      WITH keyword_terms AS (
        SELECT trim(term) AS keyword
        FROM unnest(${args.keywords}::text[]) AS term
        WHERE trim(term) <> ''
      ),
      keyword_queries AS MATERIALIZED (
        SELECT
          keyword,
          websearch_to_tsquery('simple', keyword) AS query
        FROM keyword_terms
      ),
      combined_query AS (
        SELECT string_agg(format('(%s)', query::text), ' | ')::tsquery AS query
        FROM keyword_queries
        WHERE query::text <> ''
      ),
      eligible_roles AS MATERIALIZED (
        SELECT
          cr.role_id,
          cr.company_workspace_id,
          cr.name,
          cr.work_mode,
          cr.type,
          cw.company_name,
          cw.published_name,
          official_job.company_name AS official_job_company_name,
          cr.location_text,
          cr.opportunity_search_tsv,
          cr.posted_at,
          cr.updated_at
        FROM public.company_roles cr
        JOIN public.company_workspace cw
          ON cw.company_workspace_id = cr.company_workspace_id
        LEFT JOIN LATERAL (
          SELECT NULLIF(btrim(job.company_name), '') AS company_name
          FROM public.official_jobs job
          WHERE job.role_id = cr.role_id
            AND job.is_published = true
          ORDER BY job.updated_at DESC NULLS LAST, job.id
          LIMIT 1
        ) official_job ON true
        WHERE cr.source_type = 'internal'
          AND cr.status IN ('active', 'paused')
          AND COALESCE(cr.is_expired, false) = false
          AND (cr.expires_at IS NULL OR cr.expires_at > now())
          AND lower(COALESCE(cr.information->>'testOnly', 'false')) <> 'true'
          AND NOT EXISTS (
            SELECT 1
            FROM public.talent_opportunity_fit hidden_fit
            WHERE hidden_fit.talent_id = ${args.userId}::uuid
              AND hidden_fit.opportunity_id = cr.role_id
              AND COALESCE(hidden_fit.human_label, hidden_fit.label) = 'hold'
              AND NOT public.talent_internal_role_reconsideration_is_pending_v1(hidden_fit)
              AND NOT EXISTS (
                SELECT 1
                FROM public.talent_progress requested_progress
                WHERE requested_progress.talent_id = ${args.userId}::uuid
                  AND requested_progress.role_id = cr.role_id
                  AND requested_progress.kind = ${INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND}
              )
          )
      ),
      ranked AS MATERIALIZED (
        SELECT
          er.role_id::text AS role_id,
          er.name AS role_title,
          er.work_mode,
          er.type,
          er.company_name,
          er.published_name,
          er.official_job_company_name,
          er.location_text,
          true AS is_internal,
          latest_recommendation.id::text AS latest_recommendation_id,
          latest_recommendation.feedback AS candidate_feedback,
          latest_recommendation.saved_stage AS candidate_saved_stage,
          EXISTS (
            SELECT 1
            FROM public.talent_opportunity_tag tag
            WHERE tag.talent_id = ${args.userId}::uuid
              AND tag.opportunity_id = er.role_id
              AND (
                tag.tag IN ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
                OR tag.tag LIKE '내부단계:%'
              )
          ) AS company_process_started,
          (
            latest_recommendation.id IS NULL
            AND EXISTS (
              SELECT 1
              FROM public.talent_progress progress
              WHERE progress.talent_id = ${args.userId}
                AND progress.role_id = er.role_id
                AND progress.kind = ${INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND}
            )
          ) AS has_priority_review_request,
          EXISTS (
            SELECT 1
            FROM public.talent_opportunity_fit reconsideration_fit
            WHERE reconsideration_fit.talent_id = ${args.userId}::uuid
              AND reconsideration_fit.opportunity_id = er.role_id
              AND public.talent_internal_role_reconsideration_is_pending_v1(
                reconsideration_fit
              )
          ) AS has_reconsideration_scheduled,
          same_company_formal_roles.roles AS same_company_formal_roles,
          EXISTS (
            SELECT 1
            FROM keyword_terms kt
            WHERE length(kt.keyword) >= 3
              AND (
                position(lower(kt.keyword) in lower(coalesce(er.company_name, ''))) > 0
                OR position(lower(coalesce(er.company_name, '')) in lower(kt.keyword)) > 0
                OR position(lower(kt.keyword) in lower(coalesce(er.published_name, ''))) > 0
                OR position(lower(coalesce(er.published_name, '')) in lower(kt.keyword)) > 0
                OR position(lower(kt.keyword) in lower(coalesce(er.official_job_company_name, ''))) > 0
                OR position(lower(coalesce(er.official_job_company_name, '')) in lower(kt.keyword)) > 0
              )
          ) AS company_name_match,
          ts_rank_cd(
            ARRAY[0.04,0.57,0.64,1.0]::real[],
            er.opportunity_search_tsv,
            q.query
          )::float8 AS search_rank,
          er.posted_at,
          er.updated_at
        FROM eligible_roles er
        LEFT JOIN LATERAL (
          SELECT recommendation.id, recommendation.feedback, recommendation.saved_stage
          FROM public.talent_opportunity_recommendation recommendation
          WHERE recommendation.talent_id = ${args.userId}::uuid
            AND recommendation.role_id = er.role_id
          ORDER BY recommendation.updated_at DESC, recommendation.created_at DESC, recommendation.id DESC
          LIMIT 1
        ) latest_recommendation ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'roleId', same_company_role.role_id::text,
                'roleTitle', same_company_role.name,
                'formalRecommendationState',
                  CASE
                    WHEN same_company_recommendation.saved_stage = 'closed' THEN 'closed'
                    WHEN lower(COALESCE(same_company_recommendation.feedback, '')) IN ('like', 'positive') THEN 'accepted'
                    WHEN lower(COALESCE(same_company_recommendation.feedback, '')) IN ('dislike', 'negative') THEN 'declined'
                    ELSE 'unanswered'
                  END
              )
              ORDER BY
                same_company_recommendation.updated_at DESC,
                same_company_recommendation.created_at DESC,
                same_company_recommendation.id DESC
            ),
            '[]'::jsonb
          ) AS roles
          FROM public.company_roles same_company_role
          JOIN LATERAL (
            SELECT recommendation.*
            FROM public.talent_opportunity_recommendation recommendation
            WHERE recommendation.talent_id = ${args.userId}::uuid
              AND recommendation.role_id = same_company_role.role_id
            ORDER BY recommendation.updated_at DESC, recommendation.created_at DESC, recommendation.id DESC
            LIMIT 1
          ) same_company_recommendation ON true
          WHERE same_company_role.company_workspace_id = er.company_workspace_id
            AND same_company_role.role_id <> er.role_id
            AND lower(COALESCE(same_company_role.source_type, '')) = 'internal'
        ) same_company_formal_roles ON true
        CROSS JOIN combined_query q
        WHERE (
          q.query IS NOT NULL
          AND er.opportunity_search_tsv @@ q.query
        )
          OR EXISTS (
            SELECT 1
            FROM keyword_terms kt
            WHERE length(kt.keyword) >= 3
              AND (
                position(lower(kt.keyword) in lower(coalesce(er.company_name, ''))) > 0
                OR position(lower(coalesce(er.company_name, '')) in lower(kt.keyword)) > 0
                OR position(lower(kt.keyword) in lower(coalesce(er.published_name, ''))) > 0
                OR position(lower(coalesce(er.published_name, '')) in lower(kt.keyword)) > 0
                OR position(lower(kt.keyword) in lower(coalesce(er.official_job_company_name, ''))) > 0
                OR position(lower(coalesce(er.official_job_company_name, '')) in lower(kt.keyword)) > 0
              )
          )
        ORDER BY
          company_name_match DESC,
          search_rank DESC NULLS LAST,
          er.posted_at DESC NULLS LAST,
          er.updated_at DESC NULLS LAST,
          er.role_id
        LIMIT ${INTERNAL_ROLE_SEARCH_LIMIT}
      )
      SELECT
        role_id,
        role_title,
        work_mode,
        type,
        company_name,
        published_name,
        official_job_company_name,
        location_text,
        is_internal,
        has_priority_review_request,
        has_reconsideration_scheduled,
        latest_recommendation_id,
        candidate_feedback,
        candidate_saved_stage,
        company_process_started,
        same_company_formal_roles
      FROM ranked
      ORDER BY
        company_name_match DESC,
        search_rank DESC NULLS LAST,
        posted_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        role_id
    `;
  })) as InternalRoleSearchSqlRow[];
}

async function searchMatchedInternalRoleRows(args: {
  company: string;
  db: ReturnType<typeof getInternalRoleSearchClient>;
  keywords: string[];
  sourceRoleId: string;
  userId: string;
}) {
  return (await args.db.begin(async (tx) => {
    await tx.unsafe(
      `set local statement_timeout = '${INTERNAL_ROLE_SEARCH_STATEMENT_TIMEOUT_MS}ms'`
    );
    return tx<InternalRoleSearchSqlRow[]>`
      WITH keyword_terms AS (
        SELECT trim(term) AS keyword
        FROM unnest(${args.keywords}::text[]) AS term
        WHERE trim(term) <> ''
      ),
      combined_query AS (
        SELECT string_agg(
          format('(%s)', websearch_to_tsquery('simple', keyword)::text),
          ' | '
        )::tsquery AS query
        FROM keyword_terms
      )
      SELECT
        role.role_id::text AS role_id,
        role.name AS role_title,
        role.work_mode,
        role.type,
        workspace.company_name,
        workspace.published_name,
        official_job.company_name AS official_job_company_name,
        role.location_text,
        true AS is_internal,
        latest_recommendation.id::text AS latest_recommendation_id,
        latest_recommendation.feedback AS candidate_feedback,
        latest_recommendation.saved_stage AS candidate_saved_stage,
        same_company_formal_roles.roles AS same_company_formal_roles,
        fit.role_fit,
        fit.candidate_fit,
        fit.company_fit,
        fit.reason AS fit_reason,
        EXISTS (
          SELECT 1
          FROM public.talent_opportunity_tag tag
          WHERE tag.talent_id = ${args.userId}::uuid
            AND tag.opportunity_id = role.role_id
            AND (
              tag.tag IN ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
              OR tag.tag LIKE '내부단계:%'
            )
        ) AS company_process_started,
        (
          latest_recommendation.id IS NULL
          AND EXISTS (
            SELECT 1
            FROM public.talent_progress progress
            WHERE progress.talent_id = ${args.userId}::uuid
              AND progress.role_id = role.role_id
              AND progress.kind = ${INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND}
          )
        ) AS has_priority_review_request,
        public.talent_internal_role_reconsideration_is_pending_v1(fit)
          AS has_reconsideration_scheduled
      FROM public.company_roles role
      JOIN public.company_workspace workspace
        ON workspace.company_workspace_id = role.company_workspace_id
      LEFT JOIN LATERAL (
        SELECT NULLIF(btrim(job.company_name), '') AS company_name
        FROM public.official_jobs job
        WHERE job.role_id = role.role_id
          AND job.is_published = true
        ORDER BY job.updated_at DESC NULLS LAST, job.id
        LIMIT 1
      ) official_job ON true
      JOIN public.talent_opportunity_fit fit
        ON fit.opportunity_id = role.role_id
       AND fit.talent_id = ${args.userId}::uuid
      LEFT JOIN LATERAL (
        SELECT recommendation.id, recommendation.feedback, recommendation.saved_stage
        FROM public.talent_opportunity_recommendation recommendation
        WHERE recommendation.talent_id = ${args.userId}::uuid
          AND recommendation.role_id = role.role_id
        ORDER BY recommendation.updated_at DESC, recommendation.created_at DESC, recommendation.id DESC
        LIMIT 1
      ) latest_recommendation ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'roleId', same_company_role.role_id::text,
              'roleTitle', same_company_role.name,
              'formalRecommendationState',
                CASE
                  WHEN same_company_recommendation.saved_stage = 'closed' THEN 'closed'
                  WHEN lower(COALESCE(same_company_recommendation.feedback, '')) IN ('like', 'positive') THEN 'accepted'
                  WHEN lower(COALESCE(same_company_recommendation.feedback, '')) IN ('dislike', 'negative') THEN 'declined'
                  ELSE 'unanswered'
                END
            )
            ORDER BY
              same_company_recommendation.updated_at DESC,
              same_company_recommendation.created_at DESC,
              same_company_recommendation.id DESC
          ),
          '[]'::jsonb
        ) AS roles
        FROM public.company_roles same_company_role
        JOIN LATERAL (
          SELECT recommendation.*
          FROM public.talent_opportunity_recommendation recommendation
          WHERE recommendation.talent_id = ${args.userId}::uuid
            AND recommendation.role_id = same_company_role.role_id
          ORDER BY recommendation.updated_at DESC, recommendation.created_at DESC, recommendation.id DESC
          LIMIT 1
        ) same_company_recommendation ON true
        WHERE same_company_role.company_workspace_id = role.company_workspace_id
          AND same_company_role.role_id <> role.role_id
          AND lower(COALESCE(same_company_role.source_type, '')) = 'internal'
      ) same_company_formal_roles ON true
      CROSS JOIN combined_query query
      WHERE role.source_type = 'internal'
        AND role.status = 'active'
        AND COALESCE(role.is_expired, false) = false
        AND (role.expires_at IS NULL OR role.expires_at > now())
        AND lower(COALESCE(role.information->>'testOnly', 'false')) <> 'true'
        AND (
          public.talent_internal_role_is_candidate_visible_v1(fit)
          OR public.talent_internal_role_reconsideration_is_pending_v1(fit)
        )
        AND (
          cardinality(${args.keywords}::text[]) = 0
          OR (
            query.query IS NOT NULL
            AND role.opportunity_search_tsv @@ query.query
          )
        )
        AND (
          btrim(${args.company}) = ''
          OR position(lower(btrim(${args.company})) in lower(COALESCE(workspace.published_name, ''))) > 0
          OR position(lower(COALESCE(workspace.published_name, '')) in lower(btrim(${args.company}))) > 0
          OR position(lower(btrim(${args.company})) in lower(COALESCE(workspace.company_name, ''))) > 0
          OR position(lower(COALESCE(workspace.company_name, '')) in lower(btrim(${args.company}))) > 0
          OR position(lower(btrim(${args.company})) in lower(COALESCE(official_job.company_name, ''))) > 0
          OR position(lower(COALESCE(official_job.company_name, '')) in lower(btrim(${args.company}))) > 0
        )
        AND (
          btrim(${args.sourceRoleId}) = ''
          OR role.company_workspace_id = (
            SELECT source_role.company_workspace_id
            FROM public.company_roles source_role
            WHERE source_role.role_id = NULLIF(${args.sourceRoleId}, '')::uuid
              AND lower(COALESCE(source_role.source_type, '')) = 'internal'
            LIMIT 1
          )
        )
      ORDER BY
        fit.recommend DESC,
        CASE WHEN fit.human_label = 'fit' THEN 0 ELSE 1 END,
        fit.score DESC,
        fit.last_evaluated_at DESC,
        role.updated_at DESC NULLS LAST,
        role.role_id
      LIMIT ${INTERNAL_ROLE_SEARCH_LIMIT}
    `;
  })) as InternalRoleSearchSqlRow[];
}

async function fetchMatchedInternalRoleSourceRelationship(args: {
  db: ReturnType<typeof getInternalRoleSearchClient>;
  sourceRoleId: string;
  userId: string;
}) {
  if (!args.sourceRoleId) return null;
  const rows = await args.db<MatchedInternalRoleSourceSqlRow[]>`
    SELECT
      role.role_id::text AS role_id,
      role.name AS role_title,
      recommendation.id::text AS latest_recommendation_id,
      recommendation.feedback AS candidate_feedback,
      recommendation.saved_stage AS candidate_saved_stage,
      EXISTS (
        SELECT 1
        FROM public.talent_opportunity_tag tag
        WHERE tag.talent_id = ${args.userId}::uuid
          AND tag.opportunity_id = role.role_id
          AND (
            tag.tag IN ('내부:연결대기', '내부:연결됨', '내부:최종오퍼')
            OR tag.tag LIKE '내부단계:%'
          )
      ) AS company_process_started,
      EXISTS (
        SELECT 1
        FROM public.talent_opportunity_tag tag
        WHERE tag.talent_id = ${args.userId}::uuid
          AND tag.opportunity_id = role.role_id
          AND tag.tag IN ('내부:프로세스중단', '내부:아카이브')
      ) AS source_process_inactive
    FROM public.company_roles role
    LEFT JOIN LATERAL (
      SELECT current_recommendation.*
      FROM public.talent_opportunity_recommendation current_recommendation
      WHERE current_recommendation.talent_id = ${args.userId}::uuid
        AND current_recommendation.role_id = role.role_id
      ORDER BY
        current_recommendation.updated_at DESC,
        current_recommendation.created_at DESC,
        current_recommendation.id DESC
      LIMIT 1
    ) recommendation ON true
    WHERE role.role_id = ${args.sourceRoleId}::uuid
      AND lower(COALESCE(role.source_type, '')) = 'internal'
      AND lower(COALESCE(role.information->>'testOnly', 'false')) <> 'true'
    LIMIT 1
  `;
  return formatMatchedSourceRelationship(rows[0]);
}

export async function searchInternalRolesForCareerTool(args: {
  company?: unknown;
  keywords?: unknown;
  matchedOnly?: unknown;
  sourceRoleId?: unknown;
  userId: string;
}): Promise<InternalRoleSearchResult> {
  const requestedKeywords = normalizeKeywords(args.keywords);
  const matchedOnly = args.matchedOnly === true;
  const company = formatText(String(args.company ?? ""), "", 120);
  const rawSourceRoleId = normalizePostingRoleId(args.sourceRoleId);
  const sourceRoleId =
    rawSourceRoleId && isPostingRoleId(rawSourceRoleId) ? rawSourceRoleId : "";
  if (args.sourceRoleId && !sourceRoleId) {
    throw new Error("get_internal_roles received an invalid sourceRoleId.");
  }
  if (!matchedOnly && requestedKeywords.length === 0) {
    throw new Error("get_internal_roles requires 1-2 keywords.");
  }

  const db = getInternalRoleSearchClient();
  let searchedKeywords = requestedKeywords;
  let rows: InternalRoleSearchSqlRow[];
  let sourceRelationship: string | null = null;
  if (matchedOnly) {
    [rows, sourceRelationship] = await Promise.all([
      searchMatchedInternalRoleRows({
        company,
        db,
        keywords: searchedKeywords,
        sourceRoleId,
        userId: args.userId,
      }),
      fetchMatchedInternalRoleSourceRelationship({
        db,
        sourceRoleId,
        userId: args.userId,
      }),
    ]);
  } else {
    rows = await searchInternalRoleRows({
      db,
      keywords: searchedKeywords,
      userId: args.userId,
    });
  }
  let fallbackKeywords: string[] | undefined;
  let fallbackUsed = false;

  if (!matchedOnly && rows.length === 0) {
    const splitKeywords = splitKeywordsForFallback(requestedKeywords);
    if (
      splitKeywords.length > 0 &&
      !hasSameKeywords(splitKeywords, requestedKeywords)
    ) {
      rows = await searchInternalRoleRows({
        db,
        keywords: splitKeywords,
        userId: args.userId,
      });
      fallbackKeywords = splitKeywords;
      fallbackUsed = true;
      searchedKeywords = splitKeywords;
    }
  }

  const normalizedSameCompanyRoles = new Map(
    rows.map((row) => [
      row.role_id,
      normalizeSameCompanyFormalRoles(row.same_company_formal_roles),
    ])
  );
  const companyNameSources = rows.map((row) => ({
    companyName: row.company_name,
    publishedName: getCandidateVisibleCompanyName(row),
  }));
  const hasPriorityReviewRequest = rows.some(
    (row) => row.has_priority_review_request
  );
  const hasReconsiderationScheduled = rows.some(
    (row) => row.has_reconsideration_scheduled
  );
  const formattedRoles = rows.map((row) => {
    const sameCompanyFormalRoles =
      normalizedSameCompanyRoles.get(row.role_id) ?? [];
    return {
      formalRecommendationState: getFormalRecommendationState(row),
      id: row.role_id,
      role: formatInternalRole(row, sameCompanyFormalRoles),
      ...(sameCompanyFormalRoles.length > 0
        ? { sameCompanyFormalRoles }
        : {}),
      ...(matchedOnly
        ? { selectionContext: formatPrivateSelectionContext(row) }
        : {}),
    };
  });
  const newOptionCount = rows.filter(
    (row) =>
      getFormalRecommendationState(row) === "not_presented" &&
      !row.has_reconsideration_scheduled
  ).length;

  return {
    assistantInstruction:
      (matchedOnly
        ? [
            "Matched results are private selection context, not a candidate-facing list.",
            "Only roles with formalRecommendationState=not_presented and without the trailing Scheduled for reconsideration status may be offered; use newOptionCount, not returnedCount.",
            "Use selectionContext and sameCompanyFormalRoles only to judge whether one option is useful, and never expose their labels, reasons, or contents.",
            "Accepted, declined, and closed roles are history; a role scheduled for reconsideration is progress to explain, not an option.",
            "Do not volunteer an unpresented role's name, details, link, or posting card. A question about one is not consent: ask whether the candidate wants it added for review before explaining it. If one is worth raising, offer at most one role for review; create it only after the candidate explicitly chooses it.",
          ].join(" ") + " "
        : "") +
      "The Company fields in get_internal_roles results are candidate-safe public aliases or Undisclosed internal company. Use the returned Company value exactly and never infer or expose a raw workspace company name. " +
      (hasPriorityReviewRequest
        ? "When a returned role says 검토요청/선호전달됨 and the user asks about its progress, call internal_role_priority_review with action=register and that exact role id. Repeating register is idempotent and returns the current review progress without creating another request."
        : "") +
      (hasReconsiderationScheduled
        ? " When a returned role says Scheduled for reconsideration, explain that the user's new information is already attached to that exact role and a fresh review is scheduled. Do not ask for the same information again or imply that the role is already a formal recommendation."
        : ""),
    ...(fallbackKeywords
      ? {
          fallbackKeywords: maskInternalRoleSearchKeywords(
            fallbackKeywords,
            companyNameSources
          ),
        }
      : {}),
    fallbackUsed,
    mode: matchedOnly ? "matched" : "lookup",
    ...(matchedOnly ? { newOptionCount } : {}),
    ...(matchedOnly && sourceRoleId ? { sourceRoleId } : {}),
    ...(sourceRelationship ? { sourceRelationship } : {}),
    keywords: maskInternalRoleSearchKeywords(
      searchedKeywords,
      companyNameSources
    ),
    requestedKeywords: maskInternalRoleSearchKeywords(
      requestedKeywords,
      companyNameSources
    ),
    returnedCount: rows.length,
    roles: formattedRoles,
  };
}
