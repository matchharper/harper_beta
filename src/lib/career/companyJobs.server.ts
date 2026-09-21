import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import {
  COMPANY_JOBS_PAGE_SIZE,
  type CareerCompanyJobsPage,
} from "./companyJobs";

const DATABASE_ENV_NAMES = [
  "CAREER_ROLE_SEARCH_DATABASE_URL",
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
] as const;
let client: ReturnType<typeof postgres> | null = null;

function getCompanyJobsClient() {
  if (client) return client;
  let databaseUrl = DATABASE_ENV_NAMES.map((name) =>
    process.env[name]?.trim()
  ).find(Boolean);
  if (!databaseUrl && process.env.NODE_ENV !== "production") {
    const envPath = path.resolve(process.cwd(), "..", "worker.env");
    if (existsSync(envPath)) {
      const env = parseDotenv(readFileSync(envPath));
      databaseUrl = DATABASE_ENV_NAMES.map((name) => env[name]?.trim()).find(
        Boolean
      );
    }
  }
  if (!databaseUrl)
    throw new Error("Company jobs database connection is unavailable");
  const sslSetting =
    process.env.CAREER_ROLE_SEARCH_DATABASE_SSL?.trim().toLowerCase();
  const ssl =
    sslSetting === "false"
      ? false
      : sslSetting === "true" ||
          /supabase\.(co|com)|pooler\.supabase/i.test(databaseUrl)
        ? "require"
        : undefined;
  client = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
    ...(ssl === undefined ? {} : { ssl }),
  });
  return client;
}

export type CompanyJobIndexRow = {
  role_id: string;
  fit_score: number | null;
  is_recommended: boolean;
};

// Paginate the globally ordered company list in SQL; only the selected 20 cards
// are hydrated. A missing fit row must not remove a job from the list.
export async function fetchCompanyJobIndex(
  args: {
    companyDbId?: number | null;
    roleId?: string | null;
    offset: number;
    userId: string;
  },
  db = getCompanyJobsClient()
) {
  return db.begin("read only", async (tx) => {
    await tx`set local statement_timeout = '15000ms'`;
    return tx<CompanyJobIndexRow[]>`
      with target as (
        select ${args.companyDbId ?? null}::integer as company_db_id, null::uuid as workspace_id
        where ${args.companyDbId ?? null}::integer is not null
        union all
        select cw.company_db_id, cw.company_workspace_id
        from public.company_roles r
        join public.company_workspace cw on cw.company_workspace_id = r.company_workspace_id
        where r.role_id = ${args.roleId ?? null}::uuid
          and ${args.companyDbId ?? null}::integer is null
          and coalesce(r.information->>'testOnly', 'false') <> 'true'
      ), jobs as (
        select r.role_id, r.posted_at,
          (rec.id is not null and coalesce(rec.kind, '') <> 'user_link_import') as is_recommended,
          coalesce(fit.meta->>'score', fit.meta->>'score100', fit.meta->>'fitScore', fit.meta->>'fit_score', rec.score::text) as raw_score
        from public.company_roles r
        join public.company_workspace cw on cw.company_workspace_id = r.company_workspace_id
        left join lateral (
          select f.meta from public.talent_external_fit f
          where f.talent_id = ${args.userId}::uuid and f.role_id = r.role_id
          order by f.created_at desc limit 1
        ) fit on true
        left join lateral (
          select p.id, p.kind, p.score from public.talent_opportunity_recommendation p
          where p.talent_id = ${args.userId}::uuid and p.role_id = r.role_id
          order by p.created_at desc, p.id desc limit 1
        ) rec on true
        where exists (
          select 1 from target t where cw.company_db_id = t.company_db_id
            or cw.company_workspace_id = t.workspace_id
        )
          and r.source_type = 'external'
          and coalesce(r.information->>'testOnly', 'false') <> 'true'
          and coalesce(r.is_expired, false) = false
          and lower(coalesce(r.status, 'active')) not in (
            'archived', 'closed', 'deleted', 'ended', 'expired', 'inactive'
          )
          and (r.expires_at is null or r.expires_at >= now())
          and (coalesce(r.source_provider, '') <> 'user_submitted' or rec.id is not null)
      ), scored as (
        select *, case when trim(raw_score) ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)$'
          then trim(raw_score)::numeric else null end as score from jobs
      ), ranked as (
        select role_id, posted_at, is_recommended,
          case when score is null then null
            else round(greatest(0, least(100, case when score between 0 and 1 then score * 100 else score end)))::integer
          end as fit_score
        from scored
      )
      select role_id, fit_score, is_recommended from ranked
      order by fit_score desc nulls last, posted_at desc nulls last, role_id
      limit ${COMPANY_JOBS_PAGE_SIZE + 1} offset ${args.offset}
    `;
  });
}

export async function fetchCompanyJobsPage(args: {
  admin: TalentAdminClient;
  companyDbId?: number | null;
  roleId?: string | null;
  locale?: string | null;
  offset: number;
  userId: string;
}): Promise<CareerCompanyJobsPage> {
  const rows = await fetchCompanyJobIndex(args);
  const selected = rows.slice(0, COMPANY_JOBS_PAGE_SIZE);
  const { fetchTalentPostingCardsByRoleIds, isExpiredOpportunityRole } =
    await import("@/lib/talentOpportunity");
  const opportunities = await fetchTalentPostingCardsByRoleIds({
    admin: args.admin,
    locale: args.locale,
    roleIds: selected.map((row) => row.role_id),
    userId: args.userId,
  });
  const byRoleId = new Map(opportunities.map((item) => [item.roleId, item]));
  return {
    items: selected.flatMap((row) => {
      const opportunity = byRoleId.get(row.role_id);
      return opportunity &&
        !isExpiredOpportunityRole({
          expiresAt: opportunity.expiresAt,
          isExpired: opportunity.isExpired,
          status: opportunity.status,
        })
        ? [
            {
              opportunity,
              fitScore: row.fit_score,
              isRecommended: row.is_recommended,
            },
          ]
        : [];
    }),
    nextOffset:
      rows.length > COMPANY_JOBS_PAGE_SIZE
        ? args.offset + COMPANY_JOBS_PAGE_SIZE
        : null,
  };
}
