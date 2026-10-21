import postgres from "postgres";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseDotenv } from "dotenv";
import type {
  CompanyLandingSnapshot,
  CompanyLandingPairSnapshot,
} from "./companyLandingStats";
import { COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS } from "./companyLandingStats";

// Use the same server connection configuration as Career's company job index.
const DATABASE_ENV_NAMES = [
  "CAREER_ROLE_SEARCH_DATABASE_URL",
  "CAREER_DEV_SQL_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
  "SUPABASE_DB_URL",
] as const;
let client: ReturnType<typeof postgres> | null = null;

function getStatsClient() {
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
  if (!databaseUrl) {
    throw new Error("Company landing statistics database is unavailable");
  }
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

// Only anonymous aggregates leave the database. Keep the query here so local
// fixture verification and the public endpoint use exactly the same definition.
export async function readCompanyLandingStats(
  db = getStatsClient()
): Promise<CompanyLandingSnapshot> {
  const [row] = await db.begin("read only", async (tx) => {
    await tx`set local statement_timeout = '30000ms'`;
    return tx<CompanyLandingSnapshot[]>`
      with test_roles as materialized (
        select role_id from public.company_roles
        -- Fixture isolation applies to internal QA/demo roles. Narrow through
        -- the existing source_type index before reading their JSON metadata.
        where source_type = 'internal' and information->>'testOnly' = 'true'
      ), conversations as (
        select user_id, count(*) as message_count
        from public.talent_messages m
        where exists (
            select 1 from public.talent_setting s
            where s.user_id = m.user_id and s.is_onboarding_done = true
          )
          and (
            (message_type in ('chat', 'call_transcript')
              and role in ('user', 'assistant'))
            or (message_type = 'opportunity_feedback_note' and role = 'user')
          )
          and length(btrim(content)) > 0
        group by user_id
        -- Among completed onboardings, retain two-way chat/voice participants.
        -- Count their full history, including onboarding and job feedback.
        having count(*) filter (
          where role = 'user' and message_type in ('chat', 'call_transcript')
        ) > 0
          and count(*) filter (
            where role = 'assistant' and message_type in ('chat', 'call_transcript')
          ) > 0
      )
      select
        (select count(*)::integer from public.talent_users) as "talentCount",
        (select round(avg(message_count))::integer from conversations)
          as "averageConversationMessages",
        (
          (select count(*) from public.talent_external_fit e
           where not exists (
             select 1 from test_roles t where t.role_id = e.role_id
           ))
          +
          (select count(*) from public.talent_opportunity_fit f
           where not exists (
             select 1 from test_roles t where t.role_id = f.opportunity_id
           ) and not exists (
             select 1 from public.talent_external_fit e
             where e.talent_id = f.talent_id and e.role_id = f.opportunity_id
           ))
        )::double precision as "assessedPairCount",
        to_char(statement_timestamp() at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
    `;
  });
  if (!row) throw new Error("Company landing statistics returned no result");
  return row;
}

// The frequent refresh reads only fit aggregates, not the message population.
export async function readCompanyLandingPairStats(
  db = getStatsClient()
): Promise<CompanyLandingPairSnapshot> {
  const [row] = await db.begin("read only", async (tx) => {
    await tx`set local statement_timeout = '30000ms'`;
    return tx<CompanyLandingPairSnapshot[]>`
      with test_roles as materialized (
        select role_id from public.company_roles
        where source_type = 'internal' and information->>'testOnly' = 'true'
      ), external_counts as (
        select count(*) as total,
          count(*) filter (where e.created_at >= statement_timestamp()
            - ${COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS} * interval '1 second'
            and e.created_at <= statement_timestamp()) as recent
        from public.talent_external_fit e
         where not exists (
           select 1 from test_roles t where t.role_id = e.role_id
         )
      ), internal_counts as (
        select count(*) as total,
          count(*) filter (where f.created_at >= statement_timestamp()
            - ${COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS} * interval '1 second'
            and f.created_at <= statement_timestamp()) as recent
        from public.talent_opportunity_fit f
         where not exists (
           select 1 from test_roles t where t.role_id = f.opportunity_id
         ) and not exists (
           select 1 from public.talent_external_fit e
           where e.talent_id = f.talent_id and e.role_id = f.opportunity_id
         )
      )
      select (e.total + f.total)::double precision as "assessedPairCount",
      (e.recent + f.recent)::double precision
        / ${COMPANY_LANDING_ACTIVITY_WINDOW_SECONDS} as "recentAssessmentsPerSecond",
      to_char(statement_timestamp() at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from external_counts e cross join internal_counts f
    `;
  });
  if (!row) throw new Error("Company landing pair statistics returned no result");
  return row;
}
