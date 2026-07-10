import { existsSync, readFileSync } from "fs";
import path from "path";
import { parse as parseDotenv } from "dotenv";
import postgres from "postgres";

const DATABASE_ENV_NAMES = [
  "CAREER_COMPANY_LEADERSHIP_DATABASE_URL",
  "CAREER_ROLE_SEARCH_DATABASE_URL",
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
] as const;

const STATEMENT_TIMEOUT_MS = 15000;

type CompanyLeadershipSqlRow = {
  candid_id: string;
  education: unknown;
  headline: string | null;
  is_current_at_company: boolean;
  linkedin_url: string | null;
  name: string | null;
  previous_companies: string[] | null;
  target_role: string | null;
};

export type CompanyLeadershipEducation = {
  degree: string | null;
  field: string | null;
  school: string | null;
};

export type CompanyLeadershipPerson = {
  candidId: string;
  education: CompanyLeadershipEducation[];
  headline: string | null;
  isCurrentAtCompany: boolean;
  linkedinUrl: string | null;
  name: string;
  previousCompanies: string[];
  role: string | null;
};

let companyLeadershipClient: ReturnType<typeof postgres> | null = null;

function cleanText(value: unknown, maxLength = 4000) {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, maxLength) : "";
}

function parseCompanyDbId(value: unknown) {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseWorkspaceId(value: unknown) {
  const text = cleanText(value, 80);
  return UUID_PATTERN.test(text) ? text : null;
}

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

function getCompanyLeadershipClient() {
  if (companyLeadershipClient) return companyLeadershipClient;

  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(`${DATABASE_ENV_NAMES.join(", ")} is required.`);
  }

  const sslEnv = process.env.CAREER_COMPANY_LEADERSHIP_DATABASE_SSL?.trim()
    .toLowerCase();
  const ssl =
    sslEnv === "false"
      ? false
      : sslEnv === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;

  companyLeadershipClient = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return companyLeadershipClient;
}

function normalizeStringList(value: unknown, limit = 3) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const entry of value) {
    const text = cleanText(entry, 160);
    const key = text.toLocaleLowerCase("ko-KR");
    if (!text || seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeEducation(value: unknown): CompanyLeadershipEducation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const education = {
        degree: cleanText(record.degree, 160) || null,
        field: cleanText(record.field, 160) || null,
        school: cleanText(record.school, 220) || null,
      };
      return education.school || education.degree || education.field
        ? education
        : null;
    })
    .filter((entry): entry is CompanyLeadershipEducation => entry !== null)
    .slice(0, 3);
}

function mapLeadershipRows(
  rows: CompanyLeadershipSqlRow[]
): CompanyLeadershipPerson[] {
  return rows.map((row) => ({
    candidId: String(row.candid_id),
    education: normalizeEducation(row.education),
    headline: cleanText(row.headline, 280) || null,
    isCurrentAtCompany: Boolean(row.is_current_at_company),
    linkedinUrl: cleanText(row.linkedin_url, 500) || null,
    name: cleanText(row.name, 160) || "Unknown",
    previousCompanies: normalizeStringList(row.previous_companies, 3),
    role: cleanText(row.target_role, 160) || null,
  }));
}

async function fetchLeadershipRows(args: {
  companyDbId: number | null;
  companyWorkspaceId: string | null;
}) {
  const db = getCompanyLeadershipClient();

  return db.begin(async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);

    if (args.companyWorkspaceId) {
      return tx<CompanyLeadershipSqlRow[]>`
        WITH target_company AS MATERIALIZED (
          SELECT
            cw.company_workspace_id,
            cw.company_name,
            COALESCE(cw.company_db_id, ${args.companyDbId}::int) AS company_db_id
          FROM public.company_workspace cw
          WHERE cw.company_workspace_id = ${args.companyWorkspaceId}::uuid

          UNION ALL

          SELECT
            NULL::uuid AS company_workspace_id,
            cd.name AS company_name,
            cd.id AS company_db_id
          FROM public.company_db cd
          WHERE cd.id = ${args.companyDbId}::int
            AND NOT EXISTS (
              SELECT 1
              FROM public.company_workspace cw
              WHERE cw.company_workspace_id = ${args.companyWorkspaceId}::uuid
            )
        ),
        leaders AS MATERIALIZED (
          SELECT DISTINCT ON (ex.candid_id)
            ex.candid_id,
            tc.company_db_id,
            ex.role AS target_role,
            ex.start_date AS target_start_date,
            ex.end_date AS target_end_date,
            (ex.end_date IS NULL OR ex.end_date >= CURRENT_DATE) AS is_current_at_company
          FROM target_company tc
          JOIN public.experience_user ex
            ON ex.company_id = tc.company_db_id
          WHERE tc.company_db_id IS NOT NULL
            AND ex.candid_id IS NOT NULL
            AND ex.role IS NOT NULL
            AND (
              ex.role ~* '(^|[^[:alpha:]])(co[-[:space:]]*)?founders?([^[:alpha:]]|$)'
              OR ex.role ~* 'chief[[:space:]][[:alpha:][:space:]&/,-]*officer'
              OR ex.role ~* '(^|[^[:alpha:]])(ceo|cto|coo|cfo|cpo|cmo|cro|cbo|cio|ciso|cso|chro|clo|cao|cco|cdo|cxo)([^[:alpha:]]|$)'
            )
            AND (
              ex.end_date IS NULL
              OR ex.end_date >= CURRENT_DATE
              OR ex.role ~* '(^|[^[:alpha:]])(co[-[:space:]]*)?founders?([^[:alpha:]]|$)'
            )
          ORDER BY
            ex.candid_id,
            (ex.end_date IS NULL OR ex.end_date >= CURRENT_DATE) DESC,
            CASE
              WHEN ex.role ~* 'founder' THEN 1
              WHEN ex.role ~* 'chief executive officer|(^|[^[:alpha:]])ceo([^[:alpha:]]|$)' THEN 2
              WHEN ex.role ~* 'chief technology officer|(^|[^[:alpha:]])cto([^[:alpha:]]|$)' THEN 3
              ELSE 4
            END,
            ex.start_date DESC NULLS LAST
        )
        SELECT
          c.id AS candid_id,
          c.name,
          l.target_role,
          l.is_current_at_company,
          COALESCE(prev.previous_companies, ARRAY[]::text[]) AS previous_companies,
          COALESCE(edu.education, '[]'::jsonb) AS education,
          c.linkedin_url,
          c.headline
        FROM leaders l
        JOIN public.candid c
          ON c.id = l.candid_id
        LEFT JOIN LATERAL (
          SELECT array_agg(p.company_name ORDER BY p.last_start_date DESC NULLS LAST) AS previous_companies
          FROM (
            SELECT
              cd.id,
              min(cd.name) AS company_name,
              max(ex.start_date) AS last_start_date
            FROM public.experience_user ex
            JOIN public.company_db cd
              ON cd.id = ex.company_id
            WHERE ex.candid_id = l.candid_id
              AND ex.company_id IS DISTINCT FROM l.company_db_id
              AND cd.name IS NOT NULL
              AND btrim(cd.name) <> ''
              AND (
                l.target_start_date IS NULL
                OR ex.start_date IS NULL
                OR ex.start_date < l.target_start_date
                OR ex.end_date <= l.target_start_date
              )
            GROUP BY cd.id
            ORDER BY max(ex.start_date) DESC NULLS LAST
            LIMIT 3
          ) p
        ) prev ON TRUE
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'school', ed.school,
              'degree', ed.degree,
              'field', ed.field
            )
            ORDER BY ed.end_date DESC NULLS LAST, ed.start_date DESC NULLS LAST
          ) AS education
          FROM public.edu_user ed
          WHERE ed.candid_id = l.candid_id
            AND (ed.school IS NOT NULL OR ed.degree IS NOT NULL OR ed.field IS NOT NULL)
        ) edu ON TRUE
        ORDER BY
          l.is_current_at_company DESC,
          CASE
            WHEN l.target_role ~* 'founder' THEN 1
            WHEN l.target_role ~* 'chief executive officer|(^|[^[:alpha:]])ceo([^[:alpha:]]|$)' THEN 2
            WHEN l.target_role ~* 'chief technology officer|(^|[^[:alpha:]])cto([^[:alpha:]]|$)' THEN 3
            ELSE 4
          END,
          c.name NULLS LAST
        LIMIT 12
      `;
    }

    return tx<CompanyLeadershipSqlRow[]>`
      WITH target_company AS MATERIALIZED (
        SELECT
          cw.company_workspace_id,
          COALESCE(cw.company_name, cd.name) AS company_name,
          cd.id AS company_db_id
        FROM public.company_db cd
        LEFT JOIN LATERAL (
          SELECT company_workspace_id, company_name
          FROM public.company_workspace
          WHERE company_db_id = cd.id
          ORDER BY test_score DESC NULLS LAST, updated_at DESC NULLS LAST
          LIMIT 1
        ) cw ON TRUE
        WHERE cd.id = ${args.companyDbId}::int
      ),
      leaders AS MATERIALIZED (
        SELECT DISTINCT ON (ex.candid_id)
          ex.candid_id,
          tc.company_db_id,
          ex.role AS target_role,
          ex.start_date AS target_start_date,
          ex.end_date AS target_end_date,
          (ex.end_date IS NULL OR ex.end_date >= CURRENT_DATE) AS is_current_at_company
        FROM target_company tc
        JOIN public.experience_user ex
          ON ex.company_id = tc.company_db_id
        WHERE ex.candid_id IS NOT NULL
          AND ex.role IS NOT NULL
          AND (
            ex.role ~* '(^|[^[:alpha:]])(co[-[:space:]]*)?founders?([^[:alpha:]]|$)'
            OR ex.role ~* 'chief[[:space:]][[:alpha:][:space:]&/,-]*officer'
            OR ex.role ~* '(^|[^[:alpha:]])(ceo|cto|coo|cfo|cpo|cmo|cro|cbo|cio|ciso|cso|chro|clo|cao|cco|cdo|cxo)([^[:alpha:]]|$)'
          )
          AND (
            ex.end_date IS NULL
            OR ex.end_date >= CURRENT_DATE
            OR ex.role ~* '(^|[^[:alpha:]])(co[-[:space:]]*)?founders?([^[:alpha:]]|$)'
          )
        ORDER BY
          ex.candid_id,
          (ex.end_date IS NULL OR ex.end_date >= CURRENT_DATE) DESC,
          CASE
            WHEN ex.role ~* 'founder' THEN 1
            WHEN ex.role ~* 'chief executive officer|(^|[^[:alpha:]])ceo([^[:alpha:]]|$)' THEN 2
            WHEN ex.role ~* 'chief technology officer|(^|[^[:alpha:]])cto([^[:alpha:]]|$)' THEN 3
            ELSE 4
          END,
          ex.start_date DESC NULLS LAST
      )
      SELECT
        c.id AS candid_id,
        c.name,
        l.target_role,
        l.is_current_at_company,
        COALESCE(prev.previous_companies, ARRAY[]::text[]) AS previous_companies,
        COALESCE(edu.education, '[]'::jsonb) AS education,
        c.linkedin_url,
        c.headline
      FROM leaders l
      JOIN public.candid c
        ON c.id = l.candid_id
      LEFT JOIN LATERAL (
        SELECT array_agg(p.company_name ORDER BY p.last_start_date DESC NULLS LAST) AS previous_companies
        FROM (
          SELECT
            cd.id,
            min(cd.name) AS company_name,
            max(ex.start_date) AS last_start_date
          FROM public.experience_user ex
          JOIN public.company_db cd
            ON cd.id = ex.company_id
          WHERE ex.candid_id = l.candid_id
            AND ex.company_id IS DISTINCT FROM l.company_db_id
            AND cd.name IS NOT NULL
            AND btrim(cd.name) <> ''
            AND (
              l.target_start_date IS NULL
              OR ex.start_date IS NULL
              OR ex.start_date < l.target_start_date
              OR ex.end_date <= l.target_start_date
            )
          GROUP BY cd.id
          ORDER BY max(ex.start_date) DESC NULLS LAST
          LIMIT 3
        ) p
      ) prev ON TRUE
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'school', ed.school,
            'degree', ed.degree,
            'field', ed.field
          )
          ORDER BY ed.end_date DESC NULLS LAST, ed.start_date DESC NULLS LAST
        ) AS education
        FROM public.edu_user ed
        WHERE ed.candid_id = l.candid_id
          AND (ed.school IS NOT NULL OR ed.degree IS NOT NULL OR ed.field IS NOT NULL)
      ) edu ON TRUE
      ORDER BY
        l.is_current_at_company DESC,
        CASE
          WHEN l.target_role ~* 'founder' THEN 1
          WHEN l.target_role ~* 'chief executive officer|(^|[^[:alpha:]])ceo([^[:alpha:]]|$)' THEN 2
          WHEN l.target_role ~* 'chief technology officer|(^|[^[:alpha:]])cto([^[:alpha:]]|$)' THEN 3
          ELSE 4
        END,
        c.name NULLS LAST
      LIMIT 12
    `;
  });
}

export async function fetchCompanyLeadership(args: {
  companyDbId?: number | string | null;
  companyWorkspaceId?: string | null;
}): Promise<CompanyLeadershipPerson[]> {
  const companyWorkspaceId = parseWorkspaceId(args.companyWorkspaceId);
  const companyDbId = parseCompanyDbId(args.companyDbId);

  if (!companyWorkspaceId && !companyDbId) {
    throw new Error("companyWorkspaceId or companyDbId is required");
  }

  const rows = await fetchLeadershipRows({
    companyDbId,
    companyWorkspaceId,
  });
  return mapLeadershipRows(rows);
}
