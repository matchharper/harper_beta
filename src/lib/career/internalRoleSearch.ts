import postgres from "postgres";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";

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
const SUMMARY_MAX_CHARS = 520;
const INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND =
  "candidate_requested_connection";

type InternalRoleSearchSqlRow = {
  company_name: string | null;
  description_summary: string | null;
  has_been_recommended: boolean;
  has_priority_review_request: boolean;
  is_internal: boolean;
  location_text: string | null;
  role_id: string;
  role_title: string;
  type: string[] | null;
  work_mode: string | null;
};

export type InternalRoleSearchResultRole = {
  id: string;
  role: string;
};

export type InternalRoleSearchResult = {
  fallbackKeywords?: string[];
  fallbackUsed: boolean;
  keywords: string[];
  requestedKeywords: string[];
  returnedCount: number;
  roles: InternalRoleSearchResultRole[];
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

function formatInternalRole(row: InternalRoleSearchSqlRow) {
  const parts = [
    `Role title: ${formatText(row.role_title)}`,
    `Company: ${formatText(row.company_name)}`,
    `Location: ${formatText(row.location_text)}`,
    row.description_summary
      ? `Summary: ${formatText(row.description_summary, "", SUMMARY_MAX_CHARS)}`
      : null,
    `${row.has_been_recommended ? "Recommended to this user: yes" : ""}`,
    row.has_priority_review_request ? "검토요청/선호전달됨" : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" | ");
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
          cr.name,
          cr.work_mode,
          cr.type,
          cw.company_name,
          cr.location_text,
          cr.description_summary,
          cr.opportunity_search_tsv,
          cr.posted_at,
          cr.updated_at
        FROM public.company_roles cr
        JOIN public.company_workspace cw
          ON cw.company_workspace_id = cr.company_workspace_id
        WHERE cr.source_type = 'internal'
          AND cr.status IN ('active', 'paused')
          AND COALESCE(cr.is_expired, false) = false
          AND (cr.expires_at IS NULL OR cr.expires_at > now())
      ),
      ranked AS MATERIALIZED (
        SELECT
          er.role_id::text AS role_id,
          er.name AS role_title,
          er.work_mode,
          er.type,
          er.company_name,
          er.location_text,
          er.description_summary,
          true AS is_internal,
          EXISTS (
            SELECT 1
            FROM public.talent_opportunity_recommendation tor
            WHERE tor.talent_id = ${args.userId}::uuid
              AND tor.role_id = er.role_id
          ) AS has_been_recommended,
          EXISTS (
            SELECT 1
            FROM public.talent_progress progress
            WHERE progress.talent_id = ${args.userId}
              AND progress.role_id = er.role_id
              AND progress.kind = ${INTERNAL_ROLE_PRIORITY_REVIEW_PROGRESS_KIND}
          ) AS has_priority_review_request,
          ts_rank_cd(
            ARRAY[0.04,0.57,0.64,1.0]::real[],
            er.opportunity_search_tsv,
            q.query
          )::float8 AS search_rank,
          er.posted_at,
          er.updated_at
        FROM eligible_roles er
        CROSS JOIN combined_query q
        WHERE q.query IS NOT NULL
          AND er.opportunity_search_tsv @@ q.query
        ORDER BY
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
        location_text,
        description_summary,
        is_internal,
        has_been_recommended,
        has_priority_review_request
      FROM ranked
      ORDER BY
        search_rank DESC NULLS LAST,
        posted_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        role_id
    `;
  })) as InternalRoleSearchSqlRow[];
}

export async function searchInternalRolesForCareerTool(args: {
  keywords: unknown;
  userId: string;
}): Promise<InternalRoleSearchResult> {
  const requestedKeywords = normalizeKeywords(args.keywords);
  if (requestedKeywords.length === 0) {
    throw new Error("get_internal_roles requires 1-2 keywords.");
  }

  const db = getInternalRoleSearchClient();
  let searchedKeywords = requestedKeywords;
  let rows = await searchInternalRoleRows({
    db,
    keywords: searchedKeywords,
    userId: args.userId,
  });
  let fallbackKeywords: string[] | undefined;
  let fallbackUsed = false;

  if (rows.length === 0) {
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

  return {
    ...(fallbackKeywords ? { fallbackKeywords } : {}),
    fallbackUsed,
    keywords: searchedKeywords,
    requestedKeywords,
    returnedCount: rows.length,
    roles: rows.map((row) => ({
      id: row.role_id,
      role: formatInternalRole(row),
    })),
  };
}
