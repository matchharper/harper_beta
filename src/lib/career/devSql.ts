import postgres from "postgres";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";
import { performance } from "node:perf_hooks";
import type { User } from "@supabase/supabase-js";
import { logLlmTokenUsage } from "@/lib/llm/usageLogging";
import { CLAUDE_MODEL } from "@/lib/llm/modelConfig";
import { supportsSamplingParametersForModel } from "@/lib/llm/llm";

export const CAREER_DEV_SQL_MODEL = CLAUDE_MODEL;

const CAREER_DEV_SQL_DATABASE_ENV_NAMES = [
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
];

const MAX_REQUEST_CHARS = 1600;
const MAX_SQL_CHARS = 12000;
const STATEMENT_TIMEOUT_MS = 15000;
const LOCK_TIMEOUT_MS = 5000;
const COMPANY_ROLE_FTS_STATEMENT_TIMEOUT_MS = 120000;

type AnthropicTextBlock = {
  text?: string;
  type?: string;
};

type AnthropicMessageResponse = {
  content?: AnthropicTextBlock[];
  id?: string;
  model?: string;
  stop_reason?: string | null;
  usage?: Record<string, unknown>;
};

export type CareerDevSqlDraft = {
  expectedResult: string;
  explanation: string;
  sql: string;
  validationErrors?: string[];
  warnings: string[];
};

export type CareerDevSqlExecutionResult = {
  command: string | null;
  rowCount: number | null;
  rows: unknown[];
};

export type CompanyRoleFtsSearchRow = {
  company_name: string | null;
  company_workspace_id: string;
  description_summary: string | null;
  expires_at: string | null;
  external_jd_url: string | null;
  location_text: string | null;
  matched_keywords: string[];
  posted_at: string | null;
  role_id: string;
  role_name: string;
  search_rank: number;
  seniority_level: string | null;
  source_type: string;
  status: string;
  updated_at: string;
  work_mode: string | null;
};

export type CompanyRoleFtsSearchResult = {
  elapsedMs: number;
  elapsedSeconds: number;
  keywords: string[];
  limit: number;
  rowCount: number;
  rows: CompanyRoleFtsSearchRow[];
  sourceType: "all" | "internal";
};

let careerDevSqlClient: ReturnType<typeof postgres> | null = null;

export function canUseCareerDevSql(user: Pick<User, "email"> | null) {
  const email = String(user?.email ?? "")
    .trim()
    .toLowerCase();

  return (
    process.env.NODE_ENV !== "production" ||
    email.endsWith("@matchharper.com") ||
    email === "hyunbin.bk@gmail.com" ||
    email === "khj605123@gmail.com"
  );
}

function readCareerDevSqlDatabaseUrl() {
  for (const envName of CAREER_DEV_SQL_DATABASE_ENV_NAMES) {
    const value = process.env[envName]?.trim();
    if (value) return value;
  }

  if (process.env.NODE_ENV !== "production") {
    const workerEnvPath = path.resolve(process.cwd(), "..", "worker.env");
    if (existsSync(workerEnvPath)) {
      const parsed = parseDotenv(readFileSync(workerEnvPath));
      for (const envName of CAREER_DEV_SQL_DATABASE_ENV_NAMES) {
        const value = parsed[envName]?.trim();
        if (value) return value;
      }
    }
  }

  return null;
}

function getCareerDevSqlClient() {
  if (careerDevSqlClient) return careerDevSqlClient;

  const databaseUrl = readCareerDevSqlDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(
      `One of ${CAREER_DEV_SQL_DATABASE_ENV_NAMES.join(
        ", "
      )} is required to execute generated SQL.`
    );
  }

  const sslEnv = process.env.CAREER_DEV_SQL_DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslEnv === "false"
      ? false
      : sslEnv === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;

  careerDevSqlClient = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return careerDevSqlClient;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean)
    .slice(0, 8);
}

function stripMarkdownFence(raw: string) {
  return raw
    .replace(/^```(?:json|sql)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractAnthropicText(response: AnthropicMessageResponse) {
  return (response.content ?? [])
    .map((block) => (block?.type === "text" ? (block.text ?? "") : ""))
    .join("")
    .trim();
}

function parseDraftJson(rawText: string): CareerDevSqlDraft {
  const cleaned = stripMarkdownFence(rawText);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const jsonText =
    start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  return {
    expectedResult: normalizeString(parsed.expectedResult),
    explanation: normalizeString(parsed.explanation),
    sql: stripMarkdownFence(normalizeString(parsed.sql)),
    warnings: normalizeStringList(parsed.warnings),
  };
}

function getDollarQuoteTag(sql: string, index: number) {
  return sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
}

function readQuotedSqlSegment(sql: string, index: number, quote: "'" | '"') {
  let cursor = index + 1;
  while (cursor < sql.length) {
    if (sql[cursor] === quote) {
      if (sql[cursor + 1] === quote) {
        cursor += 2;
        continue;
      }
      return sql.slice(index, cursor + 1);
    }
    cursor += 1;
  }
  return sql.slice(index);
}

function readDollarQuotedSqlSegment(sql: string, index: number, tag: string) {
  const bodyStart = index + tag.length;
  const bodyEnd = sql.indexOf(tag, bodyStart);
  return bodyEnd >= 0
    ? sql.slice(index, bodyEnd + tag.length)
    : sql.slice(index);
}

function stripSqlComments(sql: string) {
  let output = "";
  let cursor = 0;

  while (cursor < sql.length) {
    const char = sql[cursor];
    const nextChar = sql[cursor + 1];
    const dollarTag = getDollarQuoteTag(sql, cursor);

    if (dollarTag) {
      const segment = readDollarQuotedSqlSegment(sql, cursor, dollarTag);
      output += segment;
      cursor += segment.length;
      continue;
    }

    if (char === "'" || char === '"') {
      const segment = readQuotedSqlSegment(sql, cursor, char);
      output += segment;
      cursor += segment.length;
      continue;
    }

    if (char === "-" && nextChar === "-") {
      cursor += 2;
      while (cursor < sql.length && sql[cursor] !== "\n") {
        cursor += 1;
      }
      output += "\n";
      continue;
    }

    if (char === "/" && nextChar === "*") {
      cursor += 2;
      while (
        cursor < sql.length &&
        !(sql[cursor] === "*" && sql[cursor + 1] === "/")
      ) {
        cursor += 1;
      }
      cursor = Math.min(cursor + 2, sql.length);
      output += " ";
      continue;
    }

    output += char;
    cursor += 1;
  }

  return output.trim();
}

function splitSqlStatements(sql: string) {
  const statements: string[] = [];
  let cursor = 0;
  let statementStart = 0;

  while (cursor < sql.length) {
    const char = sql[cursor];
    const dollarTag = getDollarQuoteTag(sql, cursor);

    if (dollarTag) {
      const segment = readDollarQuotedSqlSegment(sql, cursor, dollarTag);
      cursor += segment.length;
      continue;
    }

    if (char === "'" || char === '"') {
      const segment = readQuotedSqlSegment(sql, cursor, char);
      cursor += segment.length;
      continue;
    }

    if (char === ";") {
      const statement = sql.slice(statementStart, cursor).trim();
      if (statement) statements.push(statement);
      statementStart = cursor + 1;
    }

    cursor += 1;
  }

  const finalStatement = sql.slice(statementStart).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

export function validateCareerDevSql(sql: string) {
  const errors: string[] = [];
  const rawSql = sql.trim();
  const sqlWithoutComments = stripSqlComments(rawSql);
  const lowerSql = sqlWithoutComments.toLowerCase();

  if (!rawSql) {
    errors.push("SQL이 비어 있습니다.");
    return errors;
  }

  if (rawSql.length > MAX_SQL_CHARS) {
    errors.push(`SQL은 ${MAX_SQL_CHARS}자를 넘을 수 없습니다.`);
  }

  const forbiddenPatterns: Array<[RegExp, string]> = [
    [
      /\b(drop|alter|create|truncate|grant|revoke)\b/i,
      "DDL/DCL 명령은 실행할 수 없습니다.",
    ],
    [
      /\b(copy|vacuum|analyze|reindex|cluster)\b/i,
      "운영/관리 명령은 실행할 수 없습니다.",
    ],
    [
      /\b(listen|notify|prepare|execute|deallocate)\b/i,
      "세션/준비문 관련 명령은 실행할 수 없습니다.",
    ],
    [/\bdo\s+\$/i, "DO/PLpgSQL 블록은 실행할 수 없습니다."],
    [/\bdeclare\b/i, "변수 선언은 실행할 수 없습니다."],
    [/\b(set|reset)\s+role\b/i, "role 변경은 실행할 수 없습니다."],
    [/\bsecurity\s+definer\b/i, "security definer 구문은 실행할 수 없습니다."],
    [/\bauth\./i, "auth 스키마는 수정할 수 없습니다."],
    [/\bstorage\./i, "storage 스키마는 수정할 수 없습니다."],
    [/\bpg_catalog\./i, "pg_catalog 스키마는 사용할 수 없습니다."],
    [/\binformation_schema\./i, "information_schema는 사용할 수 없습니다."],
    [/\bpg_sleep\s*\(/i, "pg_sleep은 사용할 수 없습니다."],
    [/\bdblink\b/i, "dblink는 사용할 수 없습니다."],
  ];

  for (const [pattern, message] of forbiddenPatterns) {
    if (pattern.test(sqlWithoutComments)) {
      errors.push(message);
    }
  }

  if (
    !/current_setting\s*\(\s*'app\.current_talent_id'/i.test(sqlWithoutComments)
  ) {
    errors.push(
      "SQL은 current_setting('app.current_talent_id', true)::uuid 로 현재 로그인 계정을 참조해야 합니다."
    );
  }

  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      sqlWithoutComments
    )
  ) {
    errors.push(
      "SQL 안에 UUID 리터럴을 직접 넣지 말고 app.current_talent_id 세션 변수를 사용해야 합니다."
    );
  }

  const statements = splitSqlStatements(sqlWithoutComments);
  if (statements.length === 0) {
    errors.push("실행 가능한 SQL 문이 없습니다.");
  }

  for (const statement of statements) {
    const statementLower = statement.toLowerCase();
    const startsWithMutation =
      /^\s*(delete\s+from|update|insert\s+into|with)\b/i.test(statement);
    const startsWithSelect = /^\s*select\b/i.test(statement);
    if (!startsWithMutation && !startsWithSelect) {
      errors.push(
        "SELECT, WITH, INSERT, UPDATE, DELETE 문만 실행할 수 있습니다."
      );
    }

    if (
      startsWithMutation &&
      !statementLower.includes("app.current_talent_id")
    ) {
      errors.push(
        "모든 변경 SQL 문은 app.current_talent_id를 포함해야 합니다."
      );
    }

    if (
      /^\s*(delete\s+from|update)\b/i.test(statement) &&
      !/\bwhere\b/i.test(statement)
    ) {
      errors.push("DELETE/UPDATE 문은 WHERE 절을 포함해야 합니다.");
    }
  }

  if (/\b(public\.)?(users|company_users|companies)\b/i.test(lowerSql)) {
    errors.push("공용/회사 계정 테이블은 이 도구에서 수정할 수 없습니다.");
  }

  return Array.from(new Set(errors));
}

function buildCareerDevSqlSystemPrompt(accountSummary: string) {
  return `You write PostgreSQL SQL for an internal Harper career dev tool.

Return ONLY JSON with this exact shape:
{
  "explanation": "Korean explanation of what the SQL will do.",
  "sql": "PostgreSQL SQL to execute.",
  "warnings": ["short Korean warning if destructive, otherwise []"],
  "expectedResult": "Korean description of the expected DB state after execution."
}

Hard rules:
- The SQL is for the current logged-in talent account only.
- The current account id is available at execution time as current_setting('app.current_talent_id', true)::uuid.
- Never include a literal UUID or email address. Always use current_setting('app.current_talent_id', true)::uuid.
- Scope every user-owned table by talent_id = current_setting('app.current_talent_id', true)::uuid or user_id = current_setting('app.current_talent_id', true)::uuid.
- Do not use DROP, ALTER, CREATE, TRUNCATE, GRANT, REVOKE, auth schema, storage schema, pg_catalog, information_schema, functions, extensions, or role changes.
- Do not use DO blocks, PL/pgSQL, DECLARE, local variables, or BEGIN/END blocks. Return plain SQL statements only.
- Prefer explicit DELETE/UPDATE statements in a transaction-safe order. The server will wrap your SQL in a transaction.
- Repeat current_setting('app.current_talent_id', true)::uuid directly in every DELETE/UPDATE/INSERT statement.
- If deleting rows that other tables reference, delete child rows first.
- Keep SQL readable. Comments are allowed, but the actual predicates must contain current_setting('app.current_talent_id', true)::uuid.

Relevant Supabase public schema:
- talent_users: user_id uuid/text primary account id; email, name, headline, bio, current_location, location, resume_file_name, resume_storage_path, resume_links, resume_text, last_logined_at, created_at, updated_at.
- talent_setting: user_id references talent_users.user_id; is_onboarding_done, status ('active'/'passive'/'stopped'), status_updated_at, engagement_types, blocked_companies, profile_visibility, periodic_interval_days, recommendation_batch_size, recommendation_source_conversation_id, created_at, updated_at.
- talent_conversations: id uuid, user_id references talent_users.user_id, stage, relief_nudge_sent, created_at, updated_at.
- talent_messages: id bigint, conversation_id references talent_conversations.id, user_id references talent_users.user_id, role, content, message_type, thinking_logs, created_at.
- talent_conversation_summaries: id uuid, talent_id references talent_users.user_id, conversation_id references talent_conversations.id, from_message_id, to_message_id, summary_text/json, created_at.
- talent_activity_events: id uuid, talent_id references talent_users.user_id, conversation_id, message_id, event_type, source, summary, impact_level, changed_domains, created_at.
- talent_insights: id bigint, talent_id references talent_users.user_id, content jsonb, last_updated_at, created_at.
- talent_experiences / talent_educations / talent_extras / talent_publications: profile tables keyed by talent_id.
- opportunity_discovery_run: id uuid, talent_id references talent_users.user_id, conversation_id, trigger, trigger_payload, status, query_plan, user_brief, coverage, settings_snapshot, message, run_mode, created_at, updated_at, started_at, completed_at, error_message.
- talent_opportunity_recommendation: id uuid, talent_id references talent_users.user_id, discovery_run_id references opportunity_discovery_run.id, role_id references company_roles.role_id, opportunity_type, fit_summary, fit_reasons, tradeoffs, preference_fit, feedback ('like'/'dislike'/null), saved_stage, viewed_at, clicked_at, created_at, updated_at.
- talent_opportunity_chat_preview: id uuid, recommendation_id references talent_opportunity_recommendation.id, discovery_run_id references opportunity_discovery_run.id, conversation_id references talent_conversations.id, assistant_message_id references talent_messages.id, rank, created_at. Delete this before deleting matching recommendations/messages/runs.
- talent_opportunity_delivery: id uuid, talent_id references talent_users.user_id, discovery_run_id references opportunity_discovery_run.id, channel, status, payload, sent_at, created_at, updated_at.
- talent_company_follow: id uuid, talent_id references talent_users.user_id, conversation_id, company_db_id, company_workspace_id, source, followed_at, unfollowed_at, created_at, updated_at.
- career_email_messages: id uuid, talent_id references talent_users.user_id, talent_message_id references talent_messages.id, direction, provider_message_id, from_email, to_email, subject, text_body, html_body, sent_at, received_at, created_at, updated_at.
- career_email_onboarding_leads: id uuid, talent_id references talent_users.user_id when claimed, converted_user_id, conversation_id, email, name, status, created_at, updated_at.
- career_email_onboarding_events: id uuid, lead_id references career_email_onboarding_leads.id, event_type, metadata, created_at. If deleting current user's onboarding leads, delete matching events first via lead_id IN (SELECT id FROM career_email_onboarding_leads WHERE talent_id = current_setting('app.current_talent_id', true)::uuid).
- email_reply_aliases / email_reply_jobs: keyed by talent_id for reply email routing. Delete aliases/jobs for current talent_id when the request includes reply-email data.

Common examples:
- "추천된 기회 전부 삭제" means delete talent_opportunity_chat_preview rows for this user's recommendations, then delete talent_opportunity_recommendation rows for this talent_id. Usually keep company_roles.
- "최근 3일간 모든 추천 데이터 삭제" means filter created_at >= now() - interval '3 days' on this user's recommendation/run/delivery/snapshot rows.
- "최근 3일간 모든 데이터 삭제" means include every current-account table above that has created_at and is scoped by talent_id/user_id, including messages, conversations, summaries, activity events, opportunity data, company recommendation/follow data, email data, profile data, and reply-email data. Do not delete talent_users unless explicitly requested. Usually keep talent_setting unless the request says to reset settings.
- "온보딩 다시 하게 만들기" usually update talent_conversations.stage='profile' or talent_setting.is_onboarding_done=false for current user, depending on the request.

Current account summary:
${accountSummary}`;
}

export async function generateCareerDevSqlDraft(args: {
  accountSummary: string;
  request: string;
}) {
  const request = args.request.trim().slice(0, MAX_REQUEST_CHARS);
  if (!request) {
    throw new Error("요청 내용을 입력해 주세요.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      max_tokens: 2400,
      messages: [
        {
          content: `User request in Korean:\n${request}`,
          role: "user",
        },
      ],
      model: CAREER_DEV_SQL_MODEL,
      system: buildCareerDevSqlSystemPrompt(args.accountSummary),
      ...(supportsSamplingParametersForModel(CAREER_DEV_SQL_MODEL)
        ? { temperature: 0.05 }
        : {}),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Anthropic Messages API request failed (${response.status}): ${errorText}`
    );
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  logLlmTokenUsage({
    label: "career/dev-sql:generate",
    model: CAREER_DEV_SQL_MODEL,
    response: json,
  });

  const draft = parseDraftJson(extractAnthropicText(json));
  draft.validationErrors = validateCareerDevSql(draft.sql);
  return draft;
}

function serializeExecutionResult(value: unknown): CareerDevSqlExecutionResult {
  const result = value as {
    command?: string;
    count?: number;
    length?: number;
    [key: string]: unknown;
  };

  return {
    command: typeof result?.command === "string" ? result.command : null,
    rowCount:
      typeof result?.count === "number"
        ? result.count
        : Array.isArray(value)
          ? value.length
          : null,
    rows: Array.isArray(value) ? value.slice(0, 20) : [],
  };
}

function serializeExecutionResults(values: unknown[]) {
  const results = values.map(serializeExecutionResult);
  const rowCounts = results
    .map((result) => result.rowCount)
    .filter((rowCount): rowCount is number => typeof rowCount === "number");

  return {
    command:
      results
        .map((result) => result.command)
        .filter(Boolean)
        .join(", ") || null,
    rowCount:
      rowCounts.length === results.length
        ? rowCounts.reduce((sum, rowCount) => sum + rowCount, 0)
        : (results[results.length - 1]?.rowCount ?? null),
    rows: results.flatMap((result) => result.rows).slice(0, 20),
  };
}

export async function executeCareerDevSql(args: {
  sql: string;
  userId: string;
}) {
  const errors = validateCareerDevSql(args.sql);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  const db = getCareerDevSqlClient();
  return db.begin(async (tx) => {
    await tx`select set_config('app.current_talent_id', ${args.userId}, true)`;
    await tx.unsafe(`set local lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
    await tx.unsafe(
      `set local statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`
    );
    const results = [];
    for (const statement of splitSqlStatements(args.sql)) {
      results.push(await tx.unsafe(statement));
    }
    return serializeExecutionResults(results);
  });
}

export async function searchCompanyRolesFtsForDev(args: {
  keywords: string[];
  limit?: number;
  sourceType?: "internal";
}): Promise<CompanyRoleFtsSearchResult> {
  const keywords = Array.from(
    new Map(
      args.keywords
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => [keyword.toLowerCase(), keyword] as const)
    ).values()
  ).slice(0, 12);

  if (keywords.length === 0) {
    throw new Error("검색 키워드를 입력해 주세요.");
  }

  const requestedLimit = Number(args.limit ?? 25);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 25;
  const internalOnly = args.sourceType === "internal";
  const db = getCareerDevSqlClient();
  const startedAt = performance.now();

  const rows = (await db.begin(async (tx) => {
    await tx.unsafe(
      `set local statement_timeout = '${COMPANY_ROLE_FTS_STATEMENT_TIMEOUT_MS}ms'`
    );
    return tx<CompanyRoleFtsSearchRow[]>`
      WITH keyword_terms AS (
        SELECT trim(term) AS keyword
        FROM unnest(${keywords}::text[]) AS term
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
      ranked AS MATERIALIZED (
        SELECT
          cr.role_id::text AS role_id,
          cr.company_workspace_id::text AS company_workspace_id,
          cr.name AS role_name,
          cw.company_name,
          cr.status,
          cr.source_type,
          cr.location_text,
          cr.work_mode,
          cr.posted_at,
          cr.expires_at,
          cr.external_jd_url,
          cr.description_summary,
          cr.seniority_level,
          cr.updated_at,
          cr.opportunity_search_tsv,
          ts_rank_cd(
            ARRAY[0.04,0.57,0.64,1.0]::real[],
            cr.opportunity_search_tsv,
            q.query
          )::float8 AS search_rank
        FROM public.company_roles cr
        JOIN public.company_workspace cw
          ON cw.company_workspace_id = cr.company_workspace_id
        CROSS JOIN combined_query q
        WHERE q.query IS NOT NULL
          AND cr.opportunity_search_tsv @@ q.query
          AND COALESCE(cr.is_expired, false) = false
          AND (cr.expires_at IS NULL OR cr.expires_at > now())
          AND (
            ${internalOnly}::boolean = false
            OR cr.source_type = 'internal'
          )
          AND (
            (
              ${internalOnly}::boolean = true
              AND cr.status IN ('active', 'paused')
            )
            OR (
              ${internalOnly}::boolean = false
              AND lower(COALESCE(cr.status, 'active')) NOT IN (
                'expired',
                'ended',
                'closed',
                'inactive',
                'archived'
              )
            )
          )
        ORDER BY
          search_rank DESC NULLS LAST,
          cr.posted_at DESC NULLS LAST,
          cr.updated_at DESC NULLS LAST,
          cr.role_id
        LIMIT ${limit}
      )
      SELECT
        ranked.role_id,
        ranked.company_workspace_id,
        ranked.role_name,
        ranked.company_name,
        ranked.status,
        ranked.source_type,
        ranked.location_text,
        ranked.work_mode,
        ranked.posted_at,
        ranked.expires_at,
        ranked.external_jd_url,
        ranked.description_summary,
        ranked.seniority_level,
        ranked.updated_at,
        COALESCE(
          (
            SELECT array_agg(k.keyword ORDER BY k.keyword)
            FROM keyword_queries k
            WHERE k.query::text <> ''
              AND ranked.opportunity_search_tsv @@ k.query
          ),
          ARRAY[]::text[]
        ) AS matched_keywords,
        ranked.search_rank
      FROM ranked
      ORDER BY
        ranked.search_rank DESC NULLS LAST,
        ranked.posted_at DESC NULLS LAST,
        ranked.updated_at DESC NULLS LAST,
        ranked.role_id
    `;
  })) as CompanyRoleFtsSearchRow[];

  const elapsedMs = performance.now() - startedAt;

  return {
    elapsedMs,
    elapsedSeconds: Math.round((elapsedMs / 1000) * 1000) / 1000,
    keywords,
    limit,
    rowCount: rows.length,
    rows,
    sourceType: internalOnly ? "internal" : "all",
  };
}
